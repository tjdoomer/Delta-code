/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  SlashCommand,
  MessageActionReturn,
  CommandKind,
} from './types.js';
import {
  parsePRD,
  ProgressTracker,
  AgentLoop,
} from '@delta-code/delta-code-core';

// Store the active loop and abort controller at module level
let activeLoop: AgentLoop | null = null;
let activeAbortController: AbortController | null = null;

const PRD_TEMPLATE = `# Project Title

## Story: Setup and Configuration
- [ ] Create configuration files
- [ ] Set up project structure

## Story: Core Feature Implementation
- [ ] Implement main feature logic
- [ ] Add error handling
- [ ] Write unit tests

## Story: Documentation and Cleanup
- [ ] Write README documentation
- [ ] Clean up code and remove unused imports
`;

const initCommand: SlashCommand = {
  name: 'init',
  description: 'Create a PRD template file.',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const config = context.services.config;
    const cwd = config?.getWorkingDir() ?? process.cwd();
    const prdPath = path.join(cwd, 'prd.md');

    try {
      await fs.writeFile(prdPath, PRD_TEMPLATE, 'utf-8');
      return {
        type: 'message',
        messageType: 'info',
        content: `PRD template created at ${prdPath}\nEdit the file with your stories, then run /loop start prd.md`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to create PRD template: ${error}`,
      };
    }
  },
};

const startCommand: SlashCommand = {
  name: 'start',
  description: 'Start the agent loop with a PRD file. Usage: /loop start <prd-file>',
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    if (activeLoop) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'A loop is already running. Use /loop stop to stop it first.',
      };
    }

    const prdFile = args.trim();
    if (!prdFile) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing PRD file path. Usage: /loop start <prd-file>',
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

    const cwd = config.getWorkingDir();
    const fullPath = path.resolve(cwd, prdFile);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const prd = parsePRD(content);

      if (prd.stories.length === 0) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'No stories found in the PRD file.',
        };
      }

      const tempDir = config.getProjectTempDir();
      const progressPath = path.join(tempDir, 'progress.txt');
      const statePath = path.join(tempDir, 'loop-state.json');

      await fs.mkdir(tempDir, { recursive: true });

      const tracker = new ProgressTracker(progressPath, statePath);
      activeLoop = new AgentLoop(config, prd, tracker);
      activeAbortController = new AbortController();

      // Run the loop in the background
      const loop = activeLoop;
      const controller = activeAbortController;
      (async () => {
        try {
          await loop.run(controller.signal);
        } catch (error) {
          console.warn(
            `[loop] Agent loop error: ${error instanceof Error ? error.message : String(error)}`,
          );
        } finally {
          if (activeLoop === loop) {
            activeLoop = null;
            activeAbortController = null;
          }
        }
      })();

      return {
        type: 'message',
        messageType: 'info',
        content: `Agent loop started with ${prd.stories.length} stories from "${prd.title}".\nUse /loop status to check progress, /loop stop to cancel.`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to start loop: ${error}`,
      };
    }
  },
};

const statusCommand: SlashCommand = {
  name: 'status',
  description: 'Show the current agent loop status.',
  kind: CommandKind.BUILT_IN,
  action: async (): Promise<MessageActionReturn> => {
    if (!activeLoop) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No agent loop is currently running.',
      };
    }

    const status = activeLoop.getStatus();
    const pct =
      status.total > 0
        ? Math.round(((status.completed + status.failed) / status.total) * 100)
        : 0;

    let message = `Agent Loop Status:\n\n`;
    message += `  Progress: ${status.completed}/${status.total} stories completed (${pct}%)\n`;
    if (status.failed > 0) {
      message += `  Failed: ${status.failed} stories\n`;
    }
    if (status.current) {
      message += `  Current: ${status.current}\n`;
    }

    return {
      type: 'message',
      messageType: 'info',
      content: message.trimEnd(),
    };
  },
};

const stopCommand: SlashCommand = {
  name: 'stop',
  description: 'Stop the currently running agent loop.',
  kind: CommandKind.BUILT_IN,
  action: async (): Promise<MessageActionReturn> => {
    if (!activeAbortController || !activeLoop) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No agent loop is currently running.',
      };
    }

    activeAbortController.abort();
    activeLoop = null;
    activeAbortController = null;

    return {
      type: 'message',
      messageType: 'info',
      content: 'Agent loop stopped.',
    };
  },
};

export const loopCommand: SlashCommand = {
  name: 'loop',
  description: 'Manage the PRD-driven agent loop.',
  kind: CommandKind.BUILT_IN,
  action: async (): Promise<MessageActionReturn> => {
    return {
      type: 'message',
      messageType: 'info',
      content:
        'Usage:\n  /loop init             — Create a PRD template\n  /loop start <prd-file> — Start the agent loop\n  /loop status           — Check loop progress\n  /loop stop             — Stop the loop',
    };
  },
  subCommands: [initCommand, startCommand, statusCommand, stopCommand],
};
