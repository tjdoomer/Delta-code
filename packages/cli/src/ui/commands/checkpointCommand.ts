/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import path from 'path';
import {
  type SlashCommand,
  type MessageActionReturn,
  CommandKind,
} from './types.js';
import { Config } from '@delta-code/delta-code-core';

function getCheckpointDir(config: Config | null): string | undefined {
  const tempDir = config?.getProjectTempDir();
  if (!tempDir) return undefined;
  return path.join(tempDir, 'user-checkpoints');
}

interface CheckpointData {
  commitHash: string;
  timestamp: string;
  label: string;
}

const saveCommand: SlashCommand = {
  name: 'save',
  description:
    'Save a named checkpoint of the current workspace. Usage: /checkpoint save [label]',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const { config, git: gitService } = context.services;
    const checkpointDir = getCheckpointDir(config);

    if (!checkpointDir) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Could not determine the checkpoint directory.',
      };
    }

    if (!gitService) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Git service is not available. Is checkpointing enabled?',
      };
    }

    const label = args.trim() || `checkpoint-${Date.now()}`;

    try {
      const commitHash = await gitService.createFileSnapshot(`checkpoint: ${label}`);

      await fs.mkdir(checkpointDir, { recursive: true });
      const data: CheckpointData = {
        commitHash,
        timestamp: new Date().toISOString(),
        label,
      };
      const filePath = path.join(checkpointDir, `${label}.json`);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');

      return {
        type: 'message',
        messageType: 'info',
        content: `Checkpoint "${label}" saved (${commitHash.substring(0, 8)}).`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to save checkpoint: ${error}`,
      };
    }
  },
};

const listCommand: SlashCommand = {
  name: 'list',
  description: 'List all saved checkpoints.',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const config = context.services.config;
    const checkpointDir = getCheckpointDir(config);

    if (!checkpointDir) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Could not determine the checkpoint directory.',
      };
    }

    try {
      await fs.mkdir(checkpointDir, { recursive: true });
      const files = await fs.readdir(checkpointDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      if (jsonFiles.length === 0) {
        return {
          type: 'message',
          messageType: 'info',
          content: 'No checkpoints found. Use /checkpoint save [label] to create one.',
        };
      }

      let message = 'Saved checkpoints:\n\n';
      for (const file of jsonFiles) {
        try {
          const raw = await fs.readFile(
            path.join(checkpointDir, file),
            'utf-8',
          );
          const data: CheckpointData = JSON.parse(raw);
          const date = data.timestamp
            ? new Date(data.timestamp).toLocaleString()
            : 'unknown';
          message += `  - \u001b[36m${data.label}\u001b[0m  \u001b[90m(${date}, ${data.commitHash.substring(0, 8)})\u001b[0m\n`;
        } catch {
          message += `  - ${file.replace('.json', '')} (corrupt)\n`;
        }
      }

      return {
        type: 'message',
        messageType: 'info',
        content: message.trimEnd(),
      };
    } catch (_error) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No checkpoints found.',
      };
    }
  },
};

const restoreSubCommand: SlashCommand = {
  name: 'restore',
  description:
    'Restore a checkpoint. Usage: /checkpoint restore <label>',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const label = args.trim();
    if (!label) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing label. Usage: /checkpoint restore <label>',
      };
    }

    const { config, git: gitService } = context.services;
    const checkpointDir = getCheckpointDir(config);

    if (!checkpointDir || !gitService) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Checkpoint or git service not available.',
      };
    }

    try {
      const filePath = path.join(checkpointDir, `${label}.json`);
      const raw = await fs.readFile(filePath, 'utf-8');
      const data: CheckpointData = JSON.parse(raw);

      await gitService.restoreProjectFromSnapshot(data.commitHash);

      return {
        type: 'message',
        messageType: 'info',
        content: `Restored checkpoint "${label}" (${data.commitHash.substring(0, 8)}).`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to restore checkpoint: ${error}`,
      };
    }
  },
  completion: async (context, partialArg): Promise<string[]> => {
    const config = context.services.config;
    const checkpointDir = getCheckpointDir(config);
    if (!checkpointDir) return [];
    try {
      const files = await fs.readdir(checkpointDir);
      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''))
        .filter((name) => name.startsWith(partialArg));
    } catch {
      return [];
    }
  },
};

export const checkpointCommand = (config: Config | null): SlashCommand | null => {
  if (!config?.getCheckpointingEnabled()) {
    return null;
  }

  return {
    name: 'checkpoint',
    altNames: ['cp'],
    description: 'Manage workspace checkpoints.',
    kind: CommandKind.BUILT_IN,
    action: async (context): Promise<MessageActionReturn> => {
      // No args: show help
      return {
        type: 'message',
        messageType: 'info',
        content:
          'Usage:\n  /checkpoint save [label]  — Save a checkpoint\n  /checkpoint list          — List checkpoints\n  /checkpoint restore <id>  — Restore a checkpoint',
      };
    },
    subCommands: [saveCommand, listCommand, restoreSubCommand],
  };
};
