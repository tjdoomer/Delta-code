/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os';
import { Config } from '../config/config.js';
import { AuthType } from '../core/contentGenerator.js';

export interface ModelEndpoint {
  name: string;
  type: 'api' | 'local';
  baseUrl?: string;
  available: boolean;
  tier: 'fast' | 'medium' | 'strong';
}

const API_MODELS: Record<string, Array<{ name: string; tier: 'fast' | 'medium' | 'strong' }>> = {
  [AuthType.USE_GEMINI]: [
    { name: 'gemini-2.5-flash-lite', tier: 'fast' },
    { name: 'gemini-2.5-flash', tier: 'medium' },
    { name: 'gemini-2.5-pro', tier: 'strong' },
  ],
  [AuthType.LOGIN_WITH_GOOGLE]: [
    { name: 'gemini-2.5-flash-lite', tier: 'fast' },
    { name: 'gemini-2.5-flash', tier: 'medium' },
    { name: 'gemini-2.5-pro', tier: 'strong' },
  ],
  [AuthType.USE_OPENAI]: [
    { name: 'gpt-4o-mini', tier: 'fast' },
    { name: 'gpt-4o', tier: 'medium' },
    { name: 'o3', tier: 'strong' },
  ],
  [AuthType.USE_CLAUDE]: [
    { name: 'claude-haiku-4-5-20251001', tier: 'fast' },
    { name: 'claude-sonnet-4-5-20250929', tier: 'strong' },
  ],
  [AuthType.QWEN_OAUTH]: [
    { name: 'qwen3-coder', tier: 'medium' },
    { name: 'delta3-coder-plus', tier: 'strong' },
  ],
};

export class ResourceProbe {
  private cachedEndpoints: ModelEndpoint[] | null = null;

  constructor(private config: Config) {}

  async probe(): Promise<ModelEndpoint[]> {
    if (this.cachedEndpoints) {
      return this.cachedEndpoints;
    }

    const endpoints: ModelEndpoint[] = [];

    // Check API models based on auth type
    const authType = this.config.getAuthType();
    if (authType && API_MODELS[authType]) {
      for (const model of API_MODELS[authType]) {
        endpoints.push({
          name: model.name,
          type: 'api',
          available: true,
          tier: model.tier,
        });
      }
    }

    // Check local Ollama endpoint
    const delegation = this.config.getDelegation();
    const localEndpoint =
      delegation?.localModelEndpoint ?? 'http://localhost:11434';

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${localEndpoint}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = (await response.json()) as {
          models?: Array<{ name: string }>;
        };
        const models = data.models ?? [];
        for (const model of models) {
          // Heuristic tier assignment based on model name/size
          let tier: 'fast' | 'medium' | 'strong' = 'medium';
          const nameLower = model.name.toLowerCase();
          if (
            nameLower.includes('7b') ||
            nameLower.includes('3b') ||
            nameLower.includes('1b')
          ) {
            tier = 'fast';
          } else if (
            nameLower.includes('70b') ||
            nameLower.includes('72b') ||
            nameLower.includes('34b')
          ) {
            tier = 'strong';
          }

          endpoints.push({
            name: model.name,
            type: 'local',
            baseUrl: localEndpoint,
            available: true,
            tier,
          });
        }
      }
    } catch {
      // Local endpoint not available, skip
    }

    this.cachedEndpoints = endpoints;
    return endpoints;
  }

  getSystemResources(): { freeMemoryMB: number; totalMemoryMB: number } {
    return {
      freeMemoryMB: Math.round(os.freemem() / (1024 * 1024)),
      totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
    };
  }
}
