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
import { ApprovalMode } from '@delta-code/delta-code-core';

const MODE_MAP: Record<string, ApprovalMode> = {
  suggest: ApprovalMode.DEFAULT,
  'auto-edit': ApprovalMode.AUTO_EDIT,
  'full-auto': ApprovalMode.YOLO,
};

const MODE_LABELS: Record<ApprovalMode, string> = {
  [ApprovalMode.DEFAULT]: 'suggest (ask before all tool use)',
  [ApprovalMode.AUTO_EDIT]: 'auto-edit (auto-approve file edits)',
  [ApprovalMode.YOLO]: 'full-auto (auto-approve everything)',
};

export const approvalModeCommand: SlashCommand = {
  name: 'approval-mode',
  altNames: ['mode'],
  description:
    'View or set the approval mode. Usage: /approval-mode [suggest|auto-edit|full-auto]',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const config = context.services.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }

    const arg = args.trim().toLowerCase();

    if (!arg) {
      const current = config.getApprovalMode();
      const label = MODE_LABELS[current] ?? current;
      let message = `Current approval mode: ${label}\n\nAvailable modes:\n`;
      for (const [name, desc] of Object.entries(MODE_LABELS)) {
        const marker = name === current ? ' (current)' : '';
        message += `  - ${desc}${marker}\n`;
      }
      return {
        type: 'message',
        messageType: 'info',
        content: message.trimEnd(),
      };
    }

    const newMode = MODE_MAP[arg];
    if (!newMode && newMode !== ApprovalMode.DEFAULT) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Unknown mode: "${arg}". Valid modes: suggest, auto-edit, full-auto`,
      };
    }

    config.setApprovalMode(newMode);
    const label = MODE_LABELS[newMode];
    return {
      type: 'message',
      messageType: 'info',
      content: `Approval mode set to: ${label}`,
    };
  },
  completion: async (_context, partialArg): Promise<string[]> => {
    const modes = Object.keys(MODE_MAP);
    return modes.filter((m) => m.startsWith(partialArg));
  },
};
