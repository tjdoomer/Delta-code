/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MicroTask {
  prompt: string;
  tier: 'fast' | 'medium' | 'strong';
  tools: string[];
  validation?: string;
}

const READ_ONLY_TOOLS = [
  'read_file',
  'list_directory',
  'search_files',
  'grep_search',
];

const EDIT_TOOLS = ['replace', 'write_new_file'];

const ALL_COMMON_TOOLS = [...READ_ONLY_TOOLS, ...EDIT_TOOLS, 'run_shell_command'];

/**
 * Classifies a task description into a MicroTask with a tier and tool set
 * using simple heuristic rules.
 */
export class TaskPlanner {
  classifyTask(description: string): MicroTask {
    const lower = description.toLowerCase();

    // Read-only patterns → fast tier
    const readOnlyPatterns = [
      'read',
      'find',
      'search',
      'list',
      'show',
      'what is',
      'where is',
      'how many',
      'count',
      'look up',
      'check',
      'inspect',
    ];

    const isReadOnly = readOnlyPatterns.some((p) => lower.includes(p));
    const mentionsMultipleFiles =
      lower.includes('all files') ||
      lower.includes('multiple files') ||
      lower.includes('across') ||
      lower.includes('refactor') ||
      lower.includes('rename across');
    const mentionsEdit =
      lower.includes('edit') ||
      lower.includes('modify') ||
      lower.includes('change') ||
      lower.includes('update') ||
      lower.includes('fix') ||
      lower.includes('add') ||
      lower.includes('create') ||
      lower.includes('implement') ||
      lower.includes('write');

    if (isReadOnly && !mentionsEdit) {
      return {
        prompt: description,
        tier: 'fast',
        tools: READ_ONLY_TOOLS,
      };
    }

    if (mentionsMultipleFiles) {
      return {
        prompt: description,
        tier: 'strong',
        tools: ALL_COMMON_TOOLS,
      };
    }

    if (mentionsEdit) {
      return {
        prompt: description,
        tier: 'medium',
        tools: [...READ_ONLY_TOOLS, ...EDIT_TOOLS],
      };
    }

    // Default to medium
    return {
      prompt: description,
      tier: 'medium',
      tools: ALL_COMMON_TOOLS,
    };
  }
}
