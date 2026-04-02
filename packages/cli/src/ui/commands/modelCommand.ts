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
import {
  AuthType,
  getProviderRegistry,
  discoverLMStudioModels,
  discoverOllamaModels,
} from '@delta-code/delta-code-core';

// Hardcoded fallback lists — used when no providers.json exists yet.
// Once users configure connections via /model add, the registry takes over.
const FALLBACK_MODELS: Record<string, string[]> = {
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

// -------------------------------------------------------------------------
// /model list — show available models from registry + discovery
// -------------------------------------------------------------------------

const listCommand: SlashCommand = {
  name: 'list',
  description: 'List available models across all connections',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const config = context.services.config;
    const registry = getProviderRegistry();
    const connections = await registry.getConnections();

    let message = '';

    // If the registry has connections, use them
    if (connections.length > 0) {
      const defaults = await registry.getDefault();
      const currentModel = config?.getModel();

      for (const conn of connections) {
        const isDefault = conn.id === defaults.connection;
        message += `\n\x1b[1m${conn.name}\x1b[0m${isDefault ? ' (default)' : ''}\n`;
        message += `  \x1b[90mtype: ${conn.type} | id: ${conn.id}\x1b[0m\n`;

        // Auto-discover models for local connections
        if (conn.autoDiscover && conn.baseUrl) {
          let models: Array<{ id: string }> = [];
          if (conn.type === 'openai-compatible' && conn.baseUrl.includes(':1234')) {
            models = await discoverLMStudioModels(conn.baseUrl);
          } else if (conn.type === 'openai-compatible' && conn.baseUrl.includes(':11434')) {
            models = await discoverOllamaModels(conn.baseUrl);
          }

          if (models.length > 0) {
            for (const m of models) {
              const marker = m.id === currentModel ? ' \x1b[32m(active)\x1b[0m' : '';
              message += `  - ${m.id}${marker}\n`;
            }
          } else {
            message += '  \x1b[90m(server unreachable or no models loaded)\x1b[0m\n';
          }
        }

        // Show capabilities for known models
        const allModels = await registry.listAllModels();
        const connModels = allModels.filter(m => m.connection === conn.id);
        for (const m of connModels) {
          if (!conn.autoDiscover) {
            const marker = m.model === currentModel ? ' \x1b[32m(active)\x1b[0m' : '';
            message += `  - ${m.model}${marker}\n`;
          }
        }
      }
    } else {
      // Fallback to hardcoded lists for users who haven't set up the registry
      const authType = config?.getAuthType();
      const currentModel = config?.getModel();

      message += 'Available models:\n\n';

      if (authType && FALLBACK_MODELS[authType]) {
        for (const model of FALLBACK_MODELS[authType]) {
          const marker = model === currentModel ? ' (current)' : '';
          message += `  - ${model}${marker}\n`;
        }
      } else {
        for (const [provider, models] of Object.entries(FALLBACK_MODELS)) {
          const label = provider.replace(/-/g, ' ');
          message += `${label}:\n`;
          for (const m of models) {
            message += `  - ${m}\n`;
          }
          message += '\n';
        }
      }

      message += '\n\x1b[90mTip: Use /model add to save a connection for quick switching.\x1b[0m';
    }

    return {
      type: 'message',
      messageType: 'info',
      content: message.trimEnd(),
    };
  },
};

// -------------------------------------------------------------------------
// /model set <model> — switch model (auto-resolves connection if registered)
// -------------------------------------------------------------------------

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

    // If model is in the capability store, update default connection too
    const registry = getProviderRegistry();
    const cap = await registry.getModelCapability(modelName);
    if (cap) {
      await registry.setDefault(cap.connection, modelName);
    }

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

    // Try registry first
    const registry = getProviderRegistry();
    const registeredModels = await registry.listAllModels();
    if (registeredModels.length > 0) {
      allModels.push(...registeredModels.map(m => m.model));
    }

    // Fall back to hardcoded lists
    if (allModels.length === 0) {
      if (authType && FALLBACK_MODELS[authType]) {
        allModels.push(...FALLBACK_MODELS[authType]);
      } else {
        for (const models of Object.values(FALLBACK_MODELS)) {
          allModels.push(...models);
        }
      }
    }

    return allModels.filter((m) => m.startsWith(partialArg));
  },
};

// -------------------------------------------------------------------------
// /model add — register a new provider connection
// -------------------------------------------------------------------------

const addCommand: SlashCommand = {
  name: 'add',
  description: 'Add a new provider connection. Usage: /model add <name> <type> <base-url> [api-key]',
  kind: CommandKind.BUILT_IN,
  action: async (_context, args): Promise<MessageActionReturn> => {
    const parts = args.trim().split(/\s+/);

    if (parts.length < 3) {
      return {
        type: 'message',
        messageType: 'error',
        content: [
          'Usage: /model add <name> <type> <base-url> [api-key]',
          '',
          'Types: openai-compatible, openai, anthropic, gemini',
          '',
          'Examples:',
          '  /model add lmstudio openai-compatible http://localhost:1234/v1',
          '  /model add ollama openai-compatible http://localhost:11434/v1',
          '  /model add openai openai https://api.openai.com/v1 sk-...',
        ].join('\n'),
      };
    }

    const [name, type, baseUrl, apiKey] = parts;
    const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    const validTypes = ['openai', 'openai-compatible', 'anthropic', 'gemini', 'bedrock', 'vertex-ai'];
    if (!validTypes.includes(type)) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Invalid type "${type}". Must be one of: ${validTypes.join(', ')}`,
      };
    }

    // Auto-discover flag: true for local servers
    const isLocal = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');

    const registry = getProviderRegistry();
    await registry.addConnection({
      id,
      type: type as 'openai' | 'openai-compatible' | 'anthropic' | 'gemini' | 'bedrock' | 'vertex-ai',
      name,
      baseUrl,
      apiKey: apiKey || (isLocal ? 'not-needed' : undefined),
      autoDiscover: isLocal,
    });

    return {
      type: 'message',
      messageType: 'info',
      content: `Connection "${name}" saved (${baseUrl}).${isLocal ? ' Auto-discovery enabled.' : ''}`,
    };
  },
};

// -------------------------------------------------------------------------
// /model remove <connection-id> — remove a saved connection
// -------------------------------------------------------------------------

const removeCommand: SlashCommand = {
  name: 'remove',
  description: 'Remove a saved connection. Usage: /model remove <connection-id>',
  kind: CommandKind.BUILT_IN,
  action: async (_context, args): Promise<MessageActionReturn> => {
    const id = args.trim();
    if (!id) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing connection ID. Usage: /model remove <connection-id>',
      };
    }

    const registry = getProviderRegistry();
    const removed = await registry.removeConnection(id);

    return {
      type: 'message',
      messageType: removed ? 'info' : 'error',
      content: removed ? `Connection "${id}" removed.` : `Connection "${id}" not found.`,
    };
  },
  completion: async (_context, partialArg): Promise<string[]> => {
    const registry = getProviderRegistry();
    const connections = await registry.getConnections();
    return connections.map(c => c.id).filter(id => id.startsWith(partialArg));
  },
};

// -------------------------------------------------------------------------
// /model refresh — re-discover models from all auto-discover connections
// -------------------------------------------------------------------------

const refreshCommand: SlashCommand = {
  name: 'refresh',
  description: 'Re-discover models from all connections with auto-discovery',
  kind: CommandKind.BUILT_IN,
  action: async (): Promise<MessageActionReturn> => {
    const registry = getProviderRegistry();
    const connections = await registry.getConnections();
    const discoverable = connections.filter(c => c.autoDiscover && c.baseUrl);

    if (discoverable.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No connections with auto-discovery. Add one with /model add.',
      };
    }

    let message = 'Refreshing models...\n\n';
    let totalFound = 0;

    for (const conn of discoverable) {
      let models: Array<{ id: string; contextWindow?: number | null }> = [];

      if (conn.baseUrl!.includes(':1234')) {
        models = await discoverLMStudioModels(conn.baseUrl);
      } else if (conn.baseUrl!.includes(':11434')) {
        models = await discoverOllamaModels(conn.baseUrl);
      }

      if (models.length > 0) {
        message += `${conn.name}: ${models.length} model(s) found\n`;
        for (const m of models) {
          message += `  - ${m.id}\n`;

          // Update capability store
          await registry.setModelCapability(m.id, {
            connection: conn.id,
            capabilities: {
              toolCalling: null,
              vision: null,
              streaming: true,
              contextWindow: ('contextWindow' in m ? m.contextWindow : null) ?? null,
              thinkBlocks: null,
            },
            lastProbed: new Date().toISOString(),
          });

          totalFound++;
        }
      } else {
        message += `${conn.name}: \x1b[90munreachable or no models loaded\x1b[0m\n`;
      }
    }

    message += `\n${totalFound} model(s) registered.`;

    return {
      type: 'message',
      messageType: 'info',
      content: message.trimEnd(),
    };
  },
};

// -------------------------------------------------------------------------
// /model — root command
// -------------------------------------------------------------------------

export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'View or change the active model.',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const config = context.services.config;
    const currentModel = config?.getModel() ?? 'unknown';
    const authType = config?.getAuthType() ?? 'unknown';

    const registry = getProviderRegistry();
    const defaults = await registry.getDefault();
    const connections = await registry.getConnections();

    let content = `Current model: ${currentModel}\nAuth type: ${authType}`;

    if (defaults.connection) {
      content += `\nDefault connection: ${defaults.connection}`;
    }

    if (connections.length > 0) {
      content += `\n${connections.length} saved connection(s)`;
    }

    content += '\n\nSubcommands: list, set, add, remove, refresh';

    return {
      type: 'message',
      messageType: 'info',
      content,
    };
  },
  subCommands: [listCommand, setCommand, addCommand, removeCommand, refreshCommand],
};
