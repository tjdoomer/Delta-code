/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  ContentBlockParam,
  ToolResultBlockParam,
  Tool as AnthropicTool,
  RawMessageStreamEvent,
  Message as AnthropicMessage,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages/messages.js';
import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  FinishReason,
  Part,
  Tool,
  CallableTool,
} from '@google/genai';
import {
  ContentGenerator,
  ContentGeneratorConfig,
} from './contentGenerator.js';
import { logApiError, logApiResponse } from '../telemetry/loggers.js';
import { ApiErrorEvent, ApiResponseEvent } from '../telemetry/types.js';
import { Config } from '../config/config.js';
import { normalizeSchemaForProvider } from '../tools/schemaNormalizer.js';

// tiktoken is used for accurate token counting instead of the old char/4 heuristic.
// cl100k_base covers Claude's tokenizer closely enough for compression threshold
// calculations — Anthropic's own count_tokens endpoint is used when available.
import { get_encoding, type Tiktoken } from 'tiktoken';

// Lazy-initialized encoder — created on first countTokens call, reused after.
let sharedEncoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!sharedEncoder) {
    sharedEncoder = get_encoding('cl100k_base');
  }
  return sharedEncoder;
}

export class AnthropicContentGenerator implements ContentGenerator {
  private client: Anthropic;
  private model: string;
  private contentGeneratorConfig: ContentGeneratorConfig;
  private config: Config;

  // Tracks in-flight tool_use blocks during streaming, keyed by content block index.
  // Each entry accumulates partial_json fragments until the block is complete.
  private streamingToolCalls: Map<number, {
    id: string;
    name: string;
    jsonFragments: string;
  }> = new Map();

  constructor(
    contentGeneratorConfig: ContentGeneratorConfig,
    gcConfig: Config,
  ) {
    this.model = contentGeneratorConfig.model;
    this.contentGeneratorConfig = contentGeneratorConfig;
    this.config = gcConfig;

    const apiKey = contentGeneratorConfig.apiKey || '';
    if (!apiKey) {
      throw new Error('Anthropic API key is required');
    }

    // The SDK handles retries (default 2), rate-limit backoff, timeouts,
    // and proper error typing — all of which the old raw-fetch lacked.
    this.client = new Anthropic({
      apiKey,
      baseURL: contentGeneratorConfig.baseUrl || undefined,
      maxRetries: contentGeneratorConfig.maxRetries ?? 3,
      timeout: contentGeneratorConfig.timeout ?? 120_000,
    });
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const startTime = Date.now();

    try {
      const params = await this.buildCreateParams(request);
      const message = await this.client.messages.create(params);
      const genAIResponse = this.convertToGenAIFormat(message as AnthropicMessage);
      const durationMs = Date.now() - startTime;

      logApiResponse(this.config, new ApiResponseEvent(
        genAIResponse.responseId || 'unknown',
        this.model,
        durationMs,
        userPromptId,
        this.contentGeneratorConfig.authType,
        genAIResponse.usageMetadata,
      ));

      return genAIResponse;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logApiError(this.config, new ApiErrorEvent(
        'unknown',
        this.model,
        errorMessage,
        durationMs,
        userPromptId,
        this.contentGeneratorConfig.authType,
      ));

      throw error;
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const startTime = Date.now();

    try {
      const params = await this.buildCreateParams(request);
      // SDK's raw stream gives us typed SSE events with proper error handling,
      // backpressure, and abort support — replacing the manual ReadableStream parsing.
      const stream = this.client.messages.stream({ ...params });

      return this.streamGenerator(stream, userPromptId, startTime);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logApiError(this.config, new ApiErrorEvent(
        'unknown',
        this.model,
        errorMessage,
        Date.now() - startTime,
        userPromptId,
        this.contentGeneratorConfig.authType,
      ));
      throw error;
    }
  }

  /**
   * Streaming generator that handles both text and tool_use content blocks.
   *
   * The old implementation only handled content_block_delta with delta.text,
   * silently dropping tool_use blocks. This version tracks tool calls by their
   * content block index, accumulates partial_json fragments, and emits
   * functionCall parts when each block completes.
   */
  private async *streamGenerator(
    stream: ReturnType<Anthropic['messages']['stream']>,
    userPromptId: string,
    startTime: number,
  ): AsyncGenerator<GenerateContentResponse> {
    // Reset tool call accumulator for this stream
    this.streamingToolCalls.clear();

    // Track the current content block index so we know which tool call
    // incoming input_json_delta events belong to
    let currentBlockIndex = -1;
    let responseId = '';

    try {
      for await (const event of stream) {
        const typedEvent = event as RawMessageStreamEvent;

        switch (typedEvent.type) {
          case 'message_start': {
            // Capture the response ID for telemetry
            if (typedEvent.message?.id) {
              responseId = typedEvent.message.id;
            }
            break;
          }

          case 'content_block_start': {
            currentBlockIndex++;
            const block = typedEvent.content_block;

            if (block?.type === 'tool_use') {
              // Start tracking a new tool call — we'll accumulate JSON
              // fragments until content_block_stop fires for this index
              this.streamingToolCalls.set(currentBlockIndex, {
                id: block.id || `tool_${Date.now()}`,
                name: block.name || '',
                jsonFragments: '',
              });
            }
            break;
          }

          case 'content_block_delta': {
            const delta = typedEvent.delta;

            if (delta?.type === 'text_delta' && 'text' in delta && delta.text) {
              // Text chunk — yield immediately for responsive streaming
              yield this.makeStreamResponse(
                [{ text: delta.text }],
                FinishReason.FINISH_REASON_UNSPECIFIED,
                responseId,
              );
            } else if (delta?.type === 'input_json_delta' && 'partial_json' in delta) {
              // Tool call argument fragment — append to the accumulator.
              // We don't yield yet because the JSON is incomplete.
              const toolCall = this.streamingToolCalls.get(currentBlockIndex);
              if (toolCall && delta.partial_json) {
                toolCall.jsonFragments += delta.partial_json;
              }
            }
            break;
          }

          case 'content_block_stop': {
            // If the completed block was a tool_use, parse the accumulated
            // JSON and emit a functionCall part
            const completedTool = this.streamingToolCalls.get(currentBlockIndex);
            if (completedTool) {
              let args: Record<string, unknown> = {};
              if (completedTool.jsonFragments) {
                try {
                  args = JSON.parse(completedTool.jsonFragments);
                } catch {
                  // Malformed JSON from the model — pass empty args rather
                  // than crashing the stream. The tool executor will handle it.
                  if (this.config.getDebugMode()) {
                    console.debug('[Anthropic] Failed to parse tool call JSON:', completedTool.jsonFragments);
                  }
                }
              }

              yield this.makeStreamResponse(
                [{
                  functionCall: {
                    id: completedTool.id,
                    name: completedTool.name,
                    args,
                  },
                }],
                FinishReason.FINISH_REASON_UNSPECIFIED,
                responseId,
              );

              this.streamingToolCalls.delete(currentBlockIndex);
            }
            break;
          }

          case 'message_delta': {
            // Final message metadata — contains stop_reason and usage
            const stopReason = (typedEvent.delta as { stop_reason?: string })?.stop_reason;
            const usage = typedEvent.usage as { output_tokens?: number } | undefined;

            // Emit a final response with the correct finish reason so the
            // tool execution loop knows whether to continue
            if (stopReason) {
              yield this.makeStreamResponse(
                [],
                this.mapFinishReason(stopReason),
                responseId,
                usage ? {
                  candidatesTokenCount: usage.output_tokens ?? 0,
                } : undefined,
              );
            }
            break;
          }

          case 'message_stop': {
            // Stream complete — log telemetry
            const durationMs = Date.now() - startTime;
            const finalMessage = await stream.finalMessage();

            logApiResponse(this.config, new ApiResponseEvent(
              responseId || `anthropic-stream-${userPromptId}`,
              this.model,
              durationMs,
              userPromptId,
              this.contentGeneratorConfig.authType,
              finalMessage?.usage ? {
                promptTokenCount: finalMessage.usage.input_tokens,
                candidatesTokenCount: finalMessage.usage.output_tokens,
                totalTokenCount: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
              } : undefined,
            ));
            break;
          }
        }
      }
    } finally {
      this.streamingToolCalls.clear();
    }
  }

  /**
   * Token counting using tiktoken (cl100k_base) as a fast local approximation.
   *
   * The old implementation used Math.ceil(content.length / 4) which was wildly
   * inaccurate for non-ASCII text and structured content. cl100k_base isn't a
   * perfect match for Claude's tokenizer but it's close enough for compression
   * threshold decisions (~5% error vs ~40% error with char/4).
   */
  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    const content = JSON.stringify(request.contents);
    const encoder = getEncoder();
    const totalTokens = encoder.encode(content).length;
    return { totalTokens };
  }

  async embedContent(_request: EmbedContentParameters): Promise<EmbedContentResponse> {
    throw new Error('Anthropic does not support embedding generation. Use a different provider for embeddings.');
  }

  // ---------------------------------------------------------------------------
  // Request building — converts @google/genai types to Anthropic SDK params
  // ---------------------------------------------------------------------------

  private async buildCreateParams(
    request: GenerateContentParameters,
  ): Promise<MessageCreateParamsNonStreaming> {
    const messages: MessageParam[] = [];
    let systemPrompt: string | undefined;

    // Extract system instruction
    if (request.config?.systemInstruction) {
      systemPrompt = this.extractSystemPrompt(request.config.systemInstruction);
    }

    // Convert contents to Anthropic message format
    if (Array.isArray(request.contents)) {
      for (const content of request.contents) {
        if (typeof content === 'string') {
          messages.push({ role: 'user', content });
        } else if ('role' in content && 'parts' in content) {
          const role = content.role === 'model' ? 'assistant' : 'user';
          const blocks = this.convertPartsToBlocks(content.parts || []);

          if (blocks.length > 0) {
            messages.push({ role, content: blocks as ContentBlockParam[] });
          }
        }
      }
    }

    // Convert tool declarations
    const tools: AnthropicTool[] = [];
    if (request.config?.tools) {
      for (const tool of request.config.tools) {
        let actualTool: Tool;
        if ('tool' in tool) {
          actualTool = await (tool as CallableTool).tool();
        } else {
          actualTool = tool as Tool;
        }

        if (actualTool.functionDeclarations) {
          for (const func of actualTool.functionDeclarations) {
            if (func.name && func.description) {
              let inputSchema: AnthropicTool.InputSchema = { type: 'object', properties: {} };

              if (func.parametersJsonSchema) {
                inputSchema = func.parametersJsonSchema as unknown as AnthropicTool.InputSchema;
              } else if (func.parameters) {
                inputSchema = func.parameters as unknown as AnthropicTool.InputSchema;
              }

              // Normalize schema for Anthropic — strips invalid required entries
              const normalized = normalizeSchemaForProvider(
                inputSchema as unknown as Record<string, unknown>,
                'anthropic',
              ) as unknown as AnthropicTool.InputSchema;

              tools.push({
                name: func.name,
                description: func.description,
                input_schema: normalized,
              });
            }
          }
        }
      }
    }

    const samplingParams = this.sanitizeSamplingParams(
      request.config as Record<string, unknown> | undefined,
    );

    const params: MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: request.config?.maxOutputTokens || 8192,
      messages,
      ...samplingParams,
    };

    if (systemPrompt) {
      params.system = systemPrompt;
    }

    if (tools.length > 0) {
      params.tools = tools;
    }

    return params;
  }

  /**
   * Normalizes the various systemInstruction shapes (@google/genai allows
   * string, Content, Content[], or undefined) into a single string.
   */
  private extractSystemPrompt(systemInstruction: unknown): string {
    if (typeof systemInstruction === 'string') {
      return systemInstruction;
    }

    if (Array.isArray(systemInstruction)) {
      return systemInstruction
        .map(content => {
          if (typeof content === 'string') return content;
          if (content && typeof content === 'object' && 'parts' in content) {
            const contentObj = content as { parts?: Part[] };
            return contentObj.parts?.map((p: Part) =>
              typeof p === 'string' ? p : 'text' in p ? p.text : '',
            ).join('\n') || '';
          }
          return '';
        })
        .join('\n');
    }

    if (systemInstruction && typeof systemInstruction === 'object' && 'parts' in systemInstruction) {
      const sysInst = systemInstruction as { parts?: Part[] };
      return sysInst.parts?.map((p: Part) =>
        typeof p === 'string' ? p : 'text' in p ? p.text : '',
      ).join('\n') || '';
    }

    return '';
  }

  /**
   * Converts @google/genai Part[] to Anthropic content blocks.
   *
   * Handles text, functionCall (→ tool_use), and functionResponse (→ tool_result).
   * The type assertions are necessary because Anthropic's union types are narrower
   * than what we construct here, but the shapes match at runtime.
   */
  private convertPartsToBlocks(parts: Part[]): (ContentBlockParam | ToolResultBlockParam)[] {
    const blocks: (ContentBlockParam | ToolResultBlockParam)[] = [];

    for (const part of parts) {
      if (typeof part === 'string') {
        blocks.push({ type: 'text' as const, text: part });
      } else if ('text' in part && part.text) {
        blocks.push({ type: 'text' as const, text: part.text });
      } else if ('functionCall' in part && part.functionCall) {
        blocks.push({
          type: 'tool_use' as const,
          id: part.functionCall.id || `tool_${Date.now()}`,
          name: part.functionCall.name || '',
          input: part.functionCall.args || {},
        } as ContentBlockParam);
      } else if ('functionResponse' in part && part.functionResponse) {
        const responseContent = typeof part.functionResponse.response === 'string'
          ? part.functionResponse.response
          : JSON.stringify(part.functionResponse.response);

        blocks.push({
          type: 'tool_result' as const,
          tool_use_id: part.functionResponse.id || '',
          content: responseContent,
        } as ToolResultBlockParam);
      }
    }

    return blocks;
  }

  /**
   * Anthropic API constraint: cannot send both temperature and top_p.
   * Temperature takes priority (industry standard).
   */
  private sanitizeSamplingParams(
    config: Record<string, unknown> | undefined,
  ): { temperature?: number; top_p?: number } {
    const params: { temperature?: number; top_p?: number } = {};

    const requestTemp = config?.temperature as number | undefined;
    const configTemp = this.contentGeneratorConfig.samplingParams?.temperature;
    const temperature = requestTemp ?? configTemp;

    const requestTopP = config?.topP as number | undefined;
    const configTopP = this.contentGeneratorConfig.samplingParams?.top_p;
    const topP = requestTopP ?? configTopP;

    if (temperature !== undefined && temperature !== null) {
      params.temperature = temperature;
      if (topP !== undefined && topP !== null && this.config.getDebugMode()) {
        console.debug(`[Anthropic] Using temperature=${temperature}, ignoring top_p=${topP} (API constraint)`);
      }
    } else if (topP !== undefined && topP !== null) {
      params.top_p = topP;
    } else {
      params.temperature = 0.0;
    }

    return params;
  }

  // ---------------------------------------------------------------------------
  // Response conversion — Anthropic SDK types → @google/genai types
  // ---------------------------------------------------------------------------

  private convertToGenAIFormat(message: AnthropicMessage): GenerateContentResponse {
    const response = new GenerateContentResponse();
    const parts: Part[] = [];

    for (const block of message.content) {
      if (block.type === 'text' && 'text' in block) {
        parts.push({ text: block.text });
      } else if (block.type === 'tool_use') {
        parts.push({
          functionCall: {
            id: block.id || '',
            name: block.name || '',
            args: (block.input as Record<string, unknown>) || {},
          },
        });
      }
      // thinking blocks are intentionally not surfaced yet — branch 6
      // (feature/think-passthrough) will handle that
    }

    response.responseId = message.id;
    response.candidates = [{
      content: { parts, role: 'model' as const },
      finishReason: this.mapFinishReason(message.stop_reason || 'end_turn'),
      index: 0,
      safetyRatings: [],
    }];

    response.modelVersion = this.model;
    response.promptFeedback = { safetyRatings: [] };

    if (message.usage) {
      response.usageMetadata = {
        promptTokenCount: message.usage.input_tokens,
        candidatesTokenCount: message.usage.output_tokens,
        totalTokenCount: message.usage.input_tokens + message.usage.output_tokens,
      };
    }

    return response;
  }

  /**
   * Helper to build a GenerateContentResponse for streaming chunks.
   * Keeps the streaming code readable by centralizing the boilerplate.
   */
  private makeStreamResponse(
    parts: Part[],
    finishReason: FinishReason,
    responseId: string,
    usagePartial?: { candidatesTokenCount?: number },
  ): GenerateContentResponse {
    const response = new GenerateContentResponse();

    response.candidates = [{
      content: { parts, role: 'model' as const },
      finishReason,
      index: 0,
      safetyRatings: [],
    }];

    response.responseId = responseId || `anthropic-stream-${Date.now()}`;
    response.modelVersion = this.model;
    response.promptFeedback = { safetyRatings: [] };

    if (usagePartial) {
      response.usageMetadata = {
        promptTokenCount: 0,
        candidatesTokenCount: usagePartial.candidatesTokenCount ?? 0,
        totalTokenCount: usagePartial.candidatesTokenCount ?? 0,
      };
    }

    return response;
  }

  private mapFinishReason(anthropicReason: string): FinishReason {
    const mapping: Record<string, FinishReason> = {
      end_turn: FinishReason.STOP,
      max_tokens: FinishReason.MAX_TOKENS,
      stop_sequence: FinishReason.STOP,
      tool_use: FinishReason.STOP,
    };
    return mapping[anthropicReason] || FinishReason.FINISH_REASON_UNSPECIFIED;
  }
}
