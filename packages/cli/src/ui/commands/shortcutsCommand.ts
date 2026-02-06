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
  defaultKeyBindings,
  type KeyBinding,
} from '../../config/keyBindings.js';

function formatKeyBinding(binding: KeyBinding): string {
  const parts: string[] = [];
  if (binding.ctrl) parts.push('Ctrl');
  if (binding.shift) parts.push('Shift');
  if (binding.command) parts.push('Cmd');
  if (binding.key) {
    parts.push(binding.key.charAt(0).toUpperCase() + binding.key.slice(1));
  } else if (binding.sequence) {
    parts.push(`[${binding.sequence}]`);
  }
  return parts.join('+');
}

function formatCommandName(command: string): string {
  // Convert camelCase to Title Case with spaces
  return command
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

export const shortcutsCommand: SlashCommand = {
  name: 'shortcuts',
  altNames: ['keys', 'keybindings'],
  description: 'Show all keyboard shortcuts.',
  kind: CommandKind.BUILT_IN,
  action: async (): Promise<MessageActionReturn> => {
    let message = 'Keyboard Shortcuts:\n\n';

    for (const [command, bindings] of Object.entries(defaultKeyBindings)) {
      const label = formatCommandName(command);
      const keys = (bindings as readonly KeyBinding[])
        .map(formatKeyBinding)
        .filter((k) => k.length > 0)
        .join(', ');
      if (keys) {
        message += `  ${keys.padEnd(30)} ${label}\n`;
      }
    }

    return {
      type: 'message',
      messageType: 'info',
      content: message.trimEnd(),
    };
  },
};
