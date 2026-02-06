/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import type { HooksConfig, HookEvent, HookContext } from './types.js';

const DEFAULT_TIMEOUT = 10000;

export class HookManager {
  constructor(
    private config: HooksConfig,
    private cwd: string,
  ) {}

  async fire(event: HookEvent, context: HookContext): Promise<void> {
    const hooks = this.config[event];
    if (!hooks || hooks.length === 0) return;

    for (const hook of hooks) {
      // If a match filter is set, only fire for matching tool name
      if (hook.match && context.tool && context.tool !== hook.match) {
        continue;
      }

      const command = this.substitute(hook.command, context);
      const timeout = hook.timeout ?? DEFAULT_TIMEOUT;

      try {
        await this.runCommand(command, timeout);
      } catch (error) {
        // Hooks must not break the main flow — log and continue
        console.warn(
          `[hooks] ${event} hook failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private substitute(command: string, context: HookContext): string {
    return command
      .replace(/\$\{tool\}/g, context.tool ?? '')
      .replace(/\$\{file\}/g, context.file ?? '')
      .replace(/\$\{command\}/g, context.command ?? '')
      .replace(/\$\{model\}/g, context.model ?? '');
  }

  private runCommand(command: string, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? true : '/bin/bash';

      const child = spawn(command, {
        cwd: this.cwd,
        shell,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: !isWindows,
        timeout,
      });

      let stderr = '';

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `Hook exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`,
            ),
          );
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }
}
