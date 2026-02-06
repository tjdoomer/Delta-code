/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '@delta-code/delta-code-core';
import {
  SlashCommand,
  MessageActionReturn,
  CommandKind,
  SlashCommandActionReturn,
} from './types.js';

const SUMMARY_FILENAME = 'PROJECT_SUMMARY.md';

function getSummaryPath(config: Config | null): string | null {
  const tempDir = config?.getProjectTempDir();
  if (!tempDir) return null;
  return path.join(tempDir, SUMMARY_FILENAME);
}

const saveCommand: SlashCommand = {
  name: 'save',
  description:
    'Save the last model response as a project summary. Usage: /summary save',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const config = context.services.config;
    const summaryPath = getSummaryPath(config);

    if (!summaryPath) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Could not determine the project temp directory.',
      };
    }

    try {
      // Get the last model response from the client history
      const chat = config?.getDeltaClient()?.getChat();
      const history = chat?.getHistory() ?? [];
      const lastModelResponse = [...history]
        .reverse()
        .find((item) => item.role === 'model');

      if (!lastModelResponse) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'No model response found to save as summary.',
        };
      }

      const text =
        lastModelResponse.parts
          ?.filter((p) => !!p.text)
          .map((p) => p.text)
          .join('\n') || '';

      if (!text) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'Last model response has no text content.',
        };
      }

      await fs.mkdir(path.dirname(summaryPath), { recursive: true });
      await fs.writeFile(summaryPath, text, 'utf-8');

      return {
        type: 'message',
        messageType: 'info',
        content: `Project summary saved to ${summaryPath}`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to save summary: ${error}`,
      };
    }
  },
};

const showCommand: SlashCommand = {
  name: 'show',
  description: 'Show the saved project summary.',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const config = context.services.config;
    const summaryPath = getSummaryPath(config);

    if (!summaryPath) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Could not determine the project temp directory.',
      };
    }

    try {
      const content = await fs.readFile(summaryPath, 'utf-8');
      return {
        type: 'message',
        messageType: 'info',
        content: `Project Summary:\n\n${content}`,
      };
    } catch (_error) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No project summary found. Use /summary to generate one, then /summary save to save it.',
      };
    }
  },
};

export const summaryCommand = (config: Config | null): SlashCommand => ({
  name: 'summary',
  description: 'Generate or view a project summary.',
  kind: CommandKind.BUILT_IN,
  action: async (): Promise<SlashCommandActionReturn> => {
    return {
      type: 'submit_prompt',
      content:
        'Summarize the work done in this conversation as a structured project summary with sections: Overview, Changes Made, Files Modified, Key Decisions, and Next Steps.',
    };
  },
  subCommands: [saveCommand, showCommand],
});
