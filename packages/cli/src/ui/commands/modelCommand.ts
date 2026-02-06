/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SlashCommand,
  MessageActionReturn,
  CommandKind,
} from './types.js';
import { AuthType } from '@delta-code/delta-code-core';

const MODEL_LISTS: Record<string, string[]> = {
  [AuthType.USE_GEMINI]: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ],
  [AuthType.LOGIN_WITH_GOOGLE]: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ],
  [AuthType.USE_OPENAI]: ['gpt-4o', 'gpt-4o-mini', 'o3', 'o4-mini'],
  [AuthType.USE_CLAUDE]: [
    'claude-sonnet-4-5-20250929',
    'claude-haiku-4-5-20251001',
  ],
  [AuthType.QWEN_OAUTH]: ['delta3-coder-plus', 'qwen3-coder'],
};

const listCommand: SlashCommand = {
  name: 'list',
  description: 'List available models for the current auth type',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const config = context.services.config;
    const authType = config?.getAuthType();

    let message = 'Available models:\n\n';

    if (authType && MODEL_LISTS[authType]) {
      const models = MODEL_LISTS[authType];
      const currentModel = config?.getModel();
      for (const model of models) {
        const marker = model === currentModel ? ' (current)' : '';
        message += `  - ${model}${marker}\n`;
      }
    } else {
      // Show all known models grouped by provider
      message += 'Gemini:\n';
      for (const m of MODEL_LISTS[AuthType.USE_GEMINI]) {
        message += `  - ${m}\n`;
      }
      message += '\nOpenAI:\n';
      for (const m of MODEL_LISTS[AuthType.USE_OPENAI]) {
        message += `  - ${m}\n`;
      }
      message += '\nClaude:\n';
      for (const m of MODEL_LISTS[AuthType.USE_CLAUDE]) {
        message += `  - ${m}\n`;
      }
      message += '\nDelta/Qwen:\n';
      for (const m of MODEL_LISTS[AuthType.QWEN_OAUTH]) {
        message += `  - ${m}\n`;
      }
    }

    return {
      type: 'message',
      messageType: 'info',
      content: message.trimEnd(),
    };
  },
};

const setCommand: SlashCommand = {
  name: 'set',
  description: 'Set the active model. Usage: /model set <model-name>',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const modelName = args.trim();
    if (!modelName) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing model name. Usage: /model set <model-name>',
      };
    }

    const config = context.services.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }

    config.setModel(modelName);
    return {
      type: 'message',
      messageType: 'info',
      content: `Model switched to: ${modelName}`,
    };
  },
  completion: async (context, partialArg): Promise<string[]> => {
    const config = context.services.config;
    const authType = config?.getAuthType();
    const allModels: string[] = [];

    if (authType && MODEL_LISTS[authType]) {
      allModels.push(...MODEL_LISTS[authType]);
    } else {
      for (const models of Object.values(MODEL_LISTS)) {
        allModels.push(...models);
      }
    }

    return allModels.filter((m) => m.startsWith(partialArg));
  },
};

export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'View or change the active model.',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const config = context.services.config;
    const currentModel = config?.getModel() ?? 'unknown';
    const authType = config?.getAuthType() ?? 'unknown';
    return {
      type: 'message',
      messageType: 'info',
      content: `Current model: ${currentModel}\nAuth type: ${authType}`,
    };
  },
  subCommands: [listCommand, setCommand],
};
