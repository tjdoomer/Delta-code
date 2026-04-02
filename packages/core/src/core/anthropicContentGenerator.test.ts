/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicContentGenerator } from './anthropicContentGenerator.js';
import { ContentGeneratorConfig } from './contentGenerator.js';
import { Config } from '../config/config.js';
import { GenerateContentParameters, FinishReason } from '@google/genai';

// Shared mock fns that the mocked SDK class wires up internally.
// We define these at module scope so they survive the vi.mock hoisting.
const mockCreate = vi.fn();
const mockStream = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: mockCreate,
        stream: mockStream,
      };
      // Constructor accepts options — just ignore them
      constructor(_opts?: any) {}
    },
  };
});

function makeMockResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-id',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Hello!' }],
    model: 'claude-3-sonnet-20240229',
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5 },
    ...overrides,
  };
}

describe('AnthropicContentGenerator', () => {
  let mockConfig: Config;
  let contentGeneratorConfig: ContentGeneratorConfig;
  let generator: AnthropicContentGenerator;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      getDebugMode: vi.fn().mockReturnValue(false),
      getUsageStatisticsEnabled: vi.fn().mockReturnValue(false),
    } as any;

    contentGeneratorConfig = {
      model: 'claude-3-sonnet-20240229',
      apiKey: 'test-api-key',
      baseUrl: 'https://api.anthropic.com/v1',
    };

    generator = new AnthropicContentGenerator(contentGeneratorConfig, mockConfig);
  });

  describe('Parameter Sanitization', () => {
    it('should use temperature when both temperature and top_p are provided', async () => {
      mockCreate.mockResolvedValueOnce(makeMockResponse());

      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: { temperature: 0.7, topP: 0.9 },
      };

      await generator.generateContent(request, 'test-prompt');

      const params = mockCreate.mock.calls[0][0];
      expect(params.temperature).toBe(0.7);
      expect(params.top_p).toBeUndefined();
    });

    it('should use top_p when only top_p is provided', async () => {
      mockCreate.mockResolvedValueOnce(makeMockResponse());

      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: { topP: 0.9 },
      };

      await generator.generateContent(request, 'test-prompt');

      const params = mockCreate.mock.calls[0][0];
      expect(params.top_p).toBe(0.9);
      expect(params.temperature).toBeUndefined();
    });

    it('should use temperature when only temperature is provided', async () => {
      mockCreate.mockResolvedValueOnce(makeMockResponse());

      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: { temperature: 0.3 },
      };

      await generator.generateContent(request, 'test-prompt');

      const params = mockCreate.mock.calls[0][0];
      expect(params.temperature).toBe(0.3);
      expect(params.top_p).toBeUndefined();
    });

    it('should use default temperature when neither parameter is provided', async () => {
      mockCreate.mockResolvedValueOnce(makeMockResponse());

      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: {},
      };

      await generator.generateContent(request, 'test-prompt');

      const params = mockCreate.mock.calls[0][0];
      expect(params.temperature).toBe(0.0);
      expect(params.top_p).toBeUndefined();
    });

    it('should prioritize request config over contentGeneratorConfig samplingParams', async () => {
      const generatorWithSamplingParams = new AnthropicContentGenerator(
        {
          ...contentGeneratorConfig,
          samplingParams: { temperature: 0.5, top_p: 0.8 },
        },
        mockConfig,
      );

      mockCreate.mockResolvedValueOnce(makeMockResponse());

      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: { temperature: 0.7 },
      };

      await generatorWithSamplingParams.generateContent(request, 'test-prompt');

      const params = mockCreate.mock.calls[0][0];
      expect(params.temperature).toBe(0.7);
      expect(params.top_p).toBeUndefined();
    });

    it('should use samplingParams when request config is empty', async () => {
      const generatorWithSamplingParams = new AnthropicContentGenerator(
        {
          ...contentGeneratorConfig,
          samplingParams: { top_p: 0.8 },
        },
        mockConfig,
      );

      mockCreate.mockResolvedValueOnce(makeMockResponse());

      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: {},
      };

      await generatorWithSamplingParams.generateContent(request, 'test-prompt');

      const params = mockCreate.mock.calls[0][0];
      expect(params.top_p).toBe(0.8);
      expect(params.temperature).toBeUndefined();
    });

    it('should log debug message when ignoring top_p in favor of temperature', async () => {
      const debugMockConfig = {
        getDebugMode: vi.fn().mockReturnValue(true),
        getUsageStatisticsEnabled: vi.fn().mockReturnValue(false),
      } as any;

      const debugGenerator = new AnthropicContentGenerator(
        contentGeneratorConfig,
        debugMockConfig,
      );

      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      mockCreate.mockResolvedValueOnce(makeMockResponse());

      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: { temperature: 0.7, topP: 0.9 },
      };

      await debugGenerator.generateContent(request, 'test-prompt');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Anthropic] Using temperature=0.7, ignoring top_p=0.9 (API constraint)',
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Response Conversion', () => {
    it('should convert text response to GenAI format', async () => {
      mockCreate.mockResolvedValueOnce(makeMockResponse({
        content: [{ type: 'text', text: 'The answer is 42.' }],
      }));

      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'What is the answer?' }] }],
      };

      const result = await generator.generateContent(request, 'test-prompt');

      expect(result.candidates?.[0]?.content?.parts?.[0]).toEqual({ text: 'The answer is 42.' });
      expect(result.candidates?.[0]?.finishReason).toBe(FinishReason.STOP);
      expect(result.responseId).toBe('test-id');
    });

    it('should convert tool_use response to functionCall parts', async () => {
      mockCreate.mockResolvedValueOnce(makeMockResponse({
        content: [
          { type: 'text', text: 'Let me search for that.' },
          {
            type: 'tool_use',
            id: 'call_123',
            name: 'web_search',
            input: { query: 'test query' },
          },
        ],
        stop_reason: 'tool_use',
      }));

      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'Search for test' }] }],
      };

      const result = await generator.generateContent(request, 'test-prompt');
      const parts = result.candidates?.[0]?.content?.parts;

      expect(parts).toHaveLength(2);
      expect(parts?.[0]).toEqual({ text: 'Let me search for that.' });
      expect(parts?.[1]).toEqual({
        functionCall: {
          id: 'call_123',
          name: 'web_search',
          args: { query: 'test query' },
        },
      });
    });

    it('should include usage metadata', async () => {
      mockCreate.mockResolvedValueOnce(makeMockResponse({
        usage: { input_tokens: 100, output_tokens: 50 },
      }));

      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };

      const result = await generator.generateContent(request, 'test-prompt');

      expect(result.usageMetadata).toEqual({
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        totalTokenCount: 150,
      });
    });
  });

  describe('Token Counting', () => {
    it('should use tiktoken instead of char/4 heuristic', async () => {
      const request = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user' as const, parts: [{ text: 'Hello world, this is a test.' }] }],
      };

      const result = await generator.countTokens(request);

      expect(result.totalTokens).toBeGreaterThan(0);
      expect(typeof result.totalTokens).toBe('number');
    });
  });

  describe('Request Building', () => {
    it('should convert system instruction to system param', async () => {
      mockCreate.mockResolvedValueOnce(makeMockResponse());

      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: {
          systemInstruction: 'You are a helpful assistant.',
        },
      };

      await generator.generateContent(request, 'test-prompt');

      const params = mockCreate.mock.calls[0][0];
      expect(params.system).toBe('You are a helpful assistant.');
    });

    it('should convert functionCall parts to tool_use blocks', async () => {
      mockCreate.mockResolvedValueOnce(makeMockResponse());

      const request = {
        model: 'claude-3-sonnet-20240229',
        contents: [{
          role: 'model',
          parts: [{
            functionCall: {
              id: 'call_1',
              name: 'read_file',
              args: { path: '/tmp/test.txt' },
            },
          }],
        }, {
          role: 'user',
          parts: [{
            functionResponse: {
              id: 'call_1',
              name: 'read_file',
              response: 'file contents here',
            },
          }],
        }],
      } as GenerateContentParameters;

      await generator.generateContent(request, 'test-prompt');

      const params = mockCreate.mock.calls[0][0];
      const assistantMsg = params.messages[0];
      const userMsg = params.messages[1];

      expect(assistantMsg.role).toBe('assistant');
      expect(assistantMsg.content[0].type).toBe('tool_use');
      expect(assistantMsg.content[0].name).toBe('read_file');

      expect(userMsg.role).toBe('user');
      expect(userMsg.content[0].type).toBe('tool_result');
      expect(userMsg.content[0].tool_use_id).toBe('call_1');
    });

    it('should set max_tokens to 8192 by default', async () => {
      mockCreate.mockResolvedValueOnce(makeMockResponse());

      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };

      await generator.generateContent(request, 'test-prompt');

      const params = mockCreate.mock.calls[0][0];
      expect(params.max_tokens).toBe(8192);
    });
  });

  describe('Error Handling', () => {
    it('should throw on missing API key', () => {
      expect(() => new AnthropicContentGenerator(
        { ...contentGeneratorConfig, apiKey: '' },
        mockConfig,
      )).toThrow('Anthropic API key is required');
    });

    it('should propagate SDK errors', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Rate limit exceeded'));

      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };

      await expect(generator.generateContent(request, 'test-prompt'))
        .rejects.toThrow('Rate limit exceeded');
    });
  });
});
