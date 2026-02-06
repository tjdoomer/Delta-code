/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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


// Anthropic API types
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | AnthropicContentBlock[];
  is_error?: boolean;
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string;
  tools?: AnthropicTool[];
  temperature?: number;
  top_p?: number;
  stream?: boolean;
}

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicStreamEvent {
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop';
  message?: AnthropicResponse;
  content_block?: AnthropicContentBlock;
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicContentGenerator implements ContentGenerator {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private contentGeneratorConfig: ContentGeneratorConfig;
  private config: Config;

  constructor(
    contentGeneratorConfig: ContentGeneratorConfig,
    gcConfig: Config,
  ) {
    this.model = contentGeneratorConfig.model;
    this.contentGeneratorConfig = contentGeneratorConfig;
    this.config = gcConfig;
    this.apiKey = contentGeneratorConfig.apiKey || '';
    this.baseUrl = contentGeneratorConfig.baseUrl || 'https://api.anthropic.com/v1';

    if (!this.apiKey) {
      throw new Error('Anthropic API key is required');
    }
  }

  private async makeRequest(
    endpoint: string,
    body: Record<string, unknown>,
    stream: boolean = false,
  ): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };

    if (stream) {
      headers['Accept'] = 'text/event-stream';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
    }

    return response;
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const startTime = Date.now();
    
    try {
      const anthropicRequest = await this.convertToAnthropicFormat(request);
      const response = await this.makeRequest('/messages', anthropicRequest as unknown as Record<string, unknown>);
      const anthropicResponse = await response.json() as AnthropicResponse;
      
      const genAIResponse = this.convertToGenAIFormat(anthropicResponse);
      const durationMs = Date.now() - startTime;

      // Log API response event for UI telemetry
      const responseEvent = new ApiResponseEvent(
        genAIResponse.responseId || 'unknown',
        this.model,
        durationMs,
        userPromptId,
        this.contentGeneratorConfig.authType,
        genAIResponse.usageMetadata,
      );

      logApiResponse(this.config, responseEvent);

      return genAIResponse;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Log API error event for UI telemetry
      const errorEvent = new ApiErrorEvent(
        'unknown',
        this.model,
        errorMessage,
        durationMs,
        userPromptId,
        this.contentGeneratorConfig.authType,
      );
      logApiError(this.config, errorEvent);

      console.error('Anthropic API Error:', errorMessage);
      throw error;
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const startTime = Date.now();
    
    try {
      const anthropicRequest = { ...await this.convertToAnthropicFormat(request), stream: true };
      const response = await this.makeRequest('/messages', anthropicRequest as unknown as Record<string, unknown>, true);
      
      if (!response.body) {
        throw new Error('No response body for streaming');
      }

      return this.streamGenerator(response.body, userPromptId, startTime);
    } catch (error) {
      // const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error('Anthropic API Streaming Error:', errorMessage);
      throw error;
    }
  }

  private async *streamGenerator(
    stream: ReadableStream<Uint8Array>,
    userPromptId: string,
    startTime: number,
  ): AsyncGenerator<GenerateContentResponse> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentContent = '';
    // let currentToolCalls: AnthropicContentBlock[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const event = JSON.parse(data) as AnthropicStreamEvent;
              
              if (event.type === 'content_block_delta' && event.delta?.text) {
                currentContent += event.delta.text;
                
                const response = new GenerateContentResponse();
                response.candidates = [{
                  content: {
                    parts: [{ text: event.delta.text }],
                    role: 'model' as const,
                  },
                  finishReason: FinishReason.FINISH_REASON_UNSPECIFIED,
                  index: 0,
                  safetyRatings: [],
                }];
                response.responseId = `anthropic-stream-${Date.now()}`;
                response.modelVersion = this.model;
                response.promptFeedback = { safetyRatings: [] };

                yield response;
              }

              if (event.type === 'message_stop') {
                const durationMs = Date.now() - startTime;
                
                // Log final response
                const responseEvent = new ApiResponseEvent(
                  `anthropic-stream-${userPromptId}`,
                  this.model,
                  durationMs,
                  userPromptId,
                  this.contentGeneratorConfig.authType,
                  event.usage ? {
                    promptTokenCount: event.usage.input_tokens,
                    candidatesTokenCount: event.usage.output_tokens,
                    totalTokenCount: event.usage.input_tokens + event.usage.output_tokens,
                  } : undefined,
                );
                logApiResponse(this.config, responseEvent);
              }
            } catch (parseError) {
              console.warn('Failed to parse streaming event:', parseError);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Anthropic doesn't have a dedicated token counting endpoint
    // Rough approximation: 1 token ≈ 4 characters
    const content = JSON.stringify(request.contents);
    const totalTokens = Math.ceil(content.length / 4);

    return { totalTokens };
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    throw new Error('Anthropic does not support embedding generation. Use a different provider for embeddings.');
  }

  private sanitizeAnthropicParams(config: any): { temperature?: number; top_p?: number } {
    const params: { temperature?: number; top_p?: number } = {};
    
    // Get temperature from request config or content generator config
    const requestTemp = config?.temperature;
    const configTemp = this.contentGeneratorConfig.samplingParams?.temperature;
    const temperature = requestTemp ?? configTemp;
    
    // Get top_p from request config or content generator config  
    const requestTopP = config?.topP;
    const configTopP = this.contentGeneratorConfig.samplingParams?.top_p;
    const topP = requestTopP ?? configTopP;

    // Anthropic API constraint: cannot specify both temperature and top_p
    // Priority: temperature > top_p (industry standard)
    if (temperature !== undefined && temperature !== null) {
      params.temperature = temperature;
      if (topP !== undefined && topP !== null) {
        if (this.config.getDebugMode()) {
          console.debug(`[Anthropic] Using temperature=${temperature}, ignoring top_p=${topP} (API constraint)`);
        }
      }
    } else if (topP !== undefined && topP !== null) {
      params.top_p = topP;
    } else {
      // Use Anthropic defaults
      params.temperature = 0.0;
    }

    return params;
  }

  private async convertToAnthropicFormat(request: GenerateContentParameters): Promise<AnthropicRequest> {
    const messages: AnthropicMessage[] = [];
    let systemPrompt: string | undefined;

    // Handle system instruction
    if (request.config?.systemInstruction) {
      if (typeof request.config.systemInstruction === 'string') {
        systemPrompt = request.config.systemInstruction;
      } else if (Array.isArray(request.config.systemInstruction)) {
        systemPrompt = request.config.systemInstruction
          .map(content => {
            if (typeof content === 'string') return content;
            if (content && typeof content === 'object' && 'parts' in content) {
              const contentObj = content as { parts?: Part[] };
              return contentObj.parts?.map((p: Part) => 
                typeof p === 'string' ? p : 'text' in p ? p.text : ''
              ).join('\n') || '';
            }
            return '';
          })
          .join('\n');
      } else if (request.config.systemInstruction && typeof request.config.systemInstruction === 'object' && 'parts' in request.config.systemInstruction) {
        const sysInst = request.config.systemInstruction as { parts?: Part[] };
        systemPrompt = sysInst.parts?.map((p: Part) =>
          typeof p === 'string' ? p : 'text' in p ? p.text : ''
        ).join('\n') || '';
      }
    }

    // Convert contents to messages
    if (Array.isArray(request.contents)) {
      for (const content of request.contents) {
        if (typeof content === 'string') {
          messages.push({ role: 'user', content });
        } else if ('role' in content && 'parts' in content) {
          const role = content.role === 'model' ? 'assistant' : 'user';
          const contentBlocks: AnthropicContentBlock[] = [];
          
          for (const part of content.parts || []) {
            if (typeof part === 'string') {
              contentBlocks.push({ type: 'text', text: part });
            } else if ('text' in part && part.text) {
              contentBlocks.push({ type: 'text', text: part.text });
            } else if ('functionCall' in part && part.functionCall) {
              contentBlocks.push({
                type: 'tool_use',
                id: part.functionCall.id || `tool_${Date.now()}`,
                name: part.functionCall.name || '',
                input: part.functionCall.args || {},
              });
            } else if ('functionResponse' in part && part.functionResponse) {
              contentBlocks.push({
                type: 'tool_result',
                tool_use_id: part.functionResponse.id || '',
                content: typeof part.functionResponse.response === 'string' 
                  ? part.functionResponse.response 
                  : JSON.stringify(part.functionResponse.response),
              });
            }
          }
          
          if (contentBlocks.length > 0) {
            messages.push({ role, content: contentBlocks });
          }
        }
      }
    }

    // Convert tools
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
              let inputSchema: Record<string, unknown> = { type: 'object', properties: {} };
              
              if (func.parametersJsonSchema) {
                inputSchema = func.parametersJsonSchema as Record<string, unknown>;
              } else if (func.parameters) {
                inputSchema = func.parameters as Record<string, unknown>;
              }

              tools.push({
                name: func.name,
                description: func.description,
                input_schema: inputSchema,
              });
            }
          }
        }
      }
    }

    // Sanitize parameters to avoid Anthropic API conflicts
    const sanitizedParams = this.sanitizeAnthropicParams(request.config);
    
    const anthropicRequest: AnthropicRequest = {
      model: this.model,
      max_tokens: request.config?.maxOutputTokens || 4096,
      messages,
      ...sanitizedParams,
    };

    if (systemPrompt) {
      anthropicRequest.system = systemPrompt;
    }

    if (tools.length > 0) {
      anthropicRequest.tools = tools;
    }

    return anthropicRequest;
  }

  private convertToGenAIFormat(anthropicResponse: AnthropicResponse): GenerateContentResponse {
    const response = new GenerateContentResponse();
    const parts: Part[] = [];

    for (const block of anthropicResponse.content) {
      if (block.type === 'text' && block.text) {
        parts.push({ text: block.text });
      } else if (block.type === 'tool_use') {
        parts.push({
          functionCall: {
            id: block.id || '',
            name: block.name || '',
            args: block.input || {},
          },
        });
      }
    }

    response.responseId = anthropicResponse.id;
    response.candidates = [{
      content: {
        parts,
        role: 'model' as const,
      },
      finishReason: this.mapFinishReason(anthropicResponse.stop_reason),
      index: 0,
      safetyRatings: [],
    }];

    response.modelVersion = this.model;
    response.promptFeedback = { safetyRatings: [] };

    if (anthropicResponse.usage) {
      response.usageMetadata = {
        promptTokenCount: anthropicResponse.usage.input_tokens,
        candidatesTokenCount: anthropicResponse.usage.output_tokens,
        totalTokenCount: anthropicResponse.usage.input_tokens + anthropicResponse.usage.output_tokens,
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
