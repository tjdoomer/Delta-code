/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import type { PRD } from './prdParser.js';

export class ProgressTracker {
  constructor(
    private progressPath: string,
    private statePath: string,
  ) {}

  async appendProgress(storyId: string, entry: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${storyId}] ${entry}\n`;
    await fs.appendFile(this.progressPath, line, 'utf-8');
  }

  async getProgress(): Promise<string> {
    try {
      return await fs.readFile(this.progressPath, 'utf-8');
    } catch {
      return '';
    }
  }

  async updateState(prd: PRD): Promise<void> {
    await fs.writeFile(this.statePath, JSON.stringify(prd, null, 2), 'utf-8');
  }

  async getState(): Promise<PRD | null> {
    try {
      const raw = await fs.readFile(this.statePath, 'utf-8');
      return JSON.parse(raw) as PRD;
    } catch {
      return null;
    }
  }
}
