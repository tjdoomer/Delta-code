/**
 * /switch — swap provider mid-conversation without losing context.
 *
 * Usage:
 *   /switch lmstudio          — switch to saved LM Studio connection
 *   /switch anthropic         — switch to saved Anthropic connection
 *   /switch <connection-id>   — switch to any saved connection
 *
 * Conversation history is preserved across the switch.
 */

import {
  SlashCommand,
  MessageActionReturn,
  CommandKind,
} from './types.js';
import {
  AuthType,
  getProviderRegistry,
} from '@delta-code/delta-code-core';

// Map connection types to AuthType enum values
function connectionTypeToAuthType(type: string): AuthType | null {
  switch (type) {
    case 'openai':
    case 'openai-compatible':
      return AuthType.USE_OPENAI;
    case 'anthropic':
      return AuthType.USE_CLAUDE;
    case 'gemini':
      return AuthType.USE_GEMINI;
    default:
      return null;
  }
}

export const switchCommand: SlashCommand = {
  name: 'switch',
  altNames: ['sw'],
  description: 'Switch provider mid-conversation. Usage: /switch <connection-id>',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const connectionId = args.trim().toLowerCase();

    if (!connectionId) {
      // Show available connections
      const registry = getProviderRegistry();
      const connections = await registry.getConnections();

      if (connections.length === 0) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'No saved connections. Use /model add to register one first.',
        };
      }

      let msg = 'Usage: /switch <connection-id>\n\nAvailable connections:\n';
      for (const c of connections) {
        msg += `  \x1b[36m${c.id}\x1b[0m — ${c.name} (${c.type})`;
        if (c.baseUrl) msg += ` @ ${c.baseUrl}`;
        msg += '\n';
      }
      return { type: 'message', messageType: 'info', content: msg.trimEnd() };
    }

    const config = context.services.config;
    if (!config) {
      return { type: 'message', messageType: 'error', content: 'Config not available.' };
    }

    // Look up the connection
    const registry = getProviderRegistry();
    const conn = await registry.getConnection(connectionId);

    if (!conn) {
      const connections = await registry.getConnections();
      const available = connections.map(c => c.id).join(', ');
      return {
        type: 'message',
        messageType: 'error',
        content: `Connection "${connectionId}" not found. Available: ${available}`,
      };
    }

    const authType = connectionTypeToAuthType(conn.type);
    if (!authType) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Unsupported connection type: ${conn.type}`,
      };
    }

    // Inject credentials into env vars for the new connection
    if (conn.type === 'openai-compatible' || conn.type === 'openai') {
      process.env.OPENAI_API_KEY = conn.apiKey || 'not-needed';
      if (conn.baseUrl) process.env.OPENAI_BASE_URL = conn.baseUrl;
    } else if (conn.type === 'anthropic') {
      process.env.ANTHROPIC_API_KEY = conn.apiKey || '';
    } else if (conn.type === 'gemini') {
      process.env.GEMINI_API_KEY = conn.apiKey || '';
    }

    // Set model if the registry has a default for this connection
    const defaults = await registry.getDefault();
    if (defaults.model) {
      process.env.OPENAI_MODEL = defaults.model;
    }

    // refreshAuth recreates the content generator while preserving
    // the conversation history — this is the core mid-session swap
    try {
      await config.refreshAuth(authType);

      // Update the default connection in the registry
      await registry.setDefault(conn.id);

      const modelName = config.getModel();
      return {
        type: 'message',
        messageType: 'info',
        content: `Switched to \x1b[36m${conn.name}\x1b[0m (${conn.type}). Model: ${modelName}\nConversation history preserved.`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to switch: ${msg}`,
      };
    }
  },
  completion: async (_context, partialArg): Promise<string[]> => {
    const registry = getProviderRegistry();
    const connections = await registry.getConnections();
    return connections.map(c => c.id).filter(id => id.startsWith(partialArg.toLowerCase()));
  },
};
