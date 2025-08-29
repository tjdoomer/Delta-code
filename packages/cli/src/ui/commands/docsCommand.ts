/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import open from 'open';
import process from 'node:process';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { MessageType } from '../types.js';

export const docsCommand: SlashCommand = {
  name: 'docs',
  description: 'open full Delta Code documentation in your browser',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext): Promise<void> => {
    const docsUrl = 'https://deltalm.github.io/delta-code-docs/en';

    if (process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec') {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `Please open the following URL in your browser to view the documentation:\n${docsUrl}`,
        },
        Date.now(),
      );
    } else {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `Opening documentation in your browser: ${docsUrl}`,
        },
        Date.now(),
      );
      await open(docsUrl);
    }
  },
};
