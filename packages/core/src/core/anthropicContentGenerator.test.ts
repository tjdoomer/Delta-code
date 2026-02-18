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
import { GenerateContentParameters } from '@google/genai';

// Mock fetch globally
global.fetch = vi.fn();

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
      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: {
          temperature: 0.7,
          topP: 0.9,
        },
      };

      // Mock successful API response
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-id',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          model: 'claude-3-sonnet-20240229',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      await generator.generateContent(request, 'test-prompt');

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      
      expect(requestBody.temperature).toBe(0.7);
      expect(requestBody.top_p).toBeUndefined();
    });

    it('should use top_p when only top_p is provided', async () => {
      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: {
          topP: 0.9,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-id',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          model: 'claude-3-sonnet-20240229',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      await generator.generateContent(request, 'test-prompt');

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      
      expect(requestBody.top_p).toBe(0.9);
      expect(requestBody.temperature).toBeUndefined();
    });

    it('should use temperature when only temperature is provided', async () => {
      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: {
          temperature: 0.3,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-id',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          model: 'claude-3-sonnet-20240229',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      await generator.generateContent(request, 'test-prompt');

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      
      expect(requestBody.temperature).toBe(0.3);
      expect(requestBody.top_p).toBeUndefined();
    });

    it('should use default temperature when neither parameter is provided', async () => {
      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: {},
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-id',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          model: 'claude-3-sonnet-20240229',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      await generator.generateContent(request, 'test-prompt');

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      
      expect(requestBody.temperature).toBe(0.0);
      expect(requestBody.top_p).toBeUndefined();
    });

    it('should prioritize request config over contentGeneratorConfig samplingParams', async () => {
      const generatorWithSamplingParams = new AnthropicContentGenerator(
        {
          ...contentGeneratorConfig,
          samplingParams: {
            temperature: 0.5,
            top_p: 0.8,
          },
        },
        mockConfig,
      );

      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: {
          temperature: 0.7, // Should override samplingParams
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-id',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          model: 'claude-3-sonnet-20240229',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      await generatorWithSamplingParams.generateContent(request, 'test-prompt');

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      
      expect(requestBody.temperature).toBe(0.7);
      expect(requestBody.top_p).toBeUndefined();
    });

    it('should use samplingParams when request config is empty', async () => {
      const generatorWithSamplingParams = new AnthropicContentGenerator(
        {
          ...contentGeneratorConfig,
          samplingParams: {
            top_p: 0.8,
          },
        },
        mockConfig,
      );

      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: {},
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-id',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          model: 'claude-3-sonnet-20240229',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      await generatorWithSamplingParams.generateContent(request, 'test-prompt');

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      
      expect(requestBody.top_p).toBe(0.8);
      expect(requestBody.temperature).toBeUndefined();
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

      const request: GenerateContentParameters = {
        model: 'claude-3-sonnet-20240229',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: {
          temperature: 0.7,
          topP: 0.9,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-id',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          model: 'claude-3-sonnet-20240229',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      await debugGenerator.generateContent(request, 'test-prompt');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Anthropic] Using temperature=0.7, ignoring top_p=0.9 (API constraint)',
      );

      consoleSpy.mockRestore();
    });
  });
});