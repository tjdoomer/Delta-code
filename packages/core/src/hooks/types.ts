/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type HookEvent =
  | 'PreToolExecution'
  | 'PostToolExecution'
  | 'PreFileEdit'
  | 'PostFileEdit';

export interface HookDefinition {
  /** Shell command to run. Supports ${tool}, ${file}, ${command}, ${model} substitutions. */
  command: string;
  /** Optional tool name filter — hook only fires when this tool is used. */
  match?: string;
  /** Timeout in milliseconds. Default: 10000 */
  timeout?: number;
}

export type HooksConfig = Partial<Record<HookEvent, HookDefinition[]>>;

export interface HookContext {
  tool?: string;
  file?: string;
  command?: string;
  model?: string;
}
