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

export const hooksCommand: SlashCommand = {
  name: 'hooks',
  description: 'List all configured lifecycle hooks.',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const hooks = context.services.settings?.merged?.hooks;

    if (!hooks || Object.keys(hooks).length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content:
          'No hooks configured.\n\nConfigure hooks in your settings file under the "hooks" key:\n\n  "hooks": {\n    "PreToolExecution": [{ "command": "echo running ${tool}" }],\n    "PostToolExecution": [{ "command": "echo done ${tool}" }]\n  }',
      };
    }

    let message = 'Configured Hooks:\n\n';
    for (const [event, definitions] of Object.entries(hooks)) {
      if (!Array.isArray(definitions) || definitions.length === 0) continue;
      message += `  ${event}:\n`;
      for (const def of definitions) {
        const matchStr = def.match ? ` (match: ${def.match})` : '';
        const timeoutStr =
          def.timeout ? ` [timeout: ${def.timeout}ms]` : '';
        message += `    - ${def.command}${matchStr}${timeoutStr}\n`;
      }
    }

    return {
      type: 'message',
      messageType: 'info',
      content: message.trimEnd(),
    };
  },
};
