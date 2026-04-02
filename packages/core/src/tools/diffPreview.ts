/**
 * Diff preview tool — dry-run an edit and return a unified diff without
 * applying it. Lets the model self-review changes before committing.
 *
 * Uses the `diff` package (already a dependency) to generate unified diffs.
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolResult,
} from './tools.js';
import { FunctionDeclaration } from '@google/genai';
import * as fs from 'node:fs/promises';
import { createPatch } from 'diff';

interface DiffPreviewParams {
  file_path: string;
  old_string: string;
  new_string: string;
  context_lines?: number;
}

const diffPreviewSchemaData: FunctionDeclaration = {
  name: 'diff_preview',
  description:
    'Preview what an edit would look like as a unified diff WITHOUT applying it. Use this to verify your changes before committing them with the edit tool. Returns a unified diff with context lines.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Absolute path to the file.',
      },
      old_string: {
        type: 'string',
        description: 'The exact text to be replaced.',
      },
      new_string: {
        type: 'string',
        description: 'The replacement text.',
      },
      context_lines: {
        type: 'number',
        description: 'Number of context lines around changes (default 3).',
      },
    },
    required: ['file_path', 'old_string', 'new_string'],
    $schema: 'http://json-schema.org/draft-07/schema#',
  },
};

class DiffPreviewInvocation extends BaseToolInvocation<DiffPreviewParams, ToolResult> {
  getDescription(): string {
    return this.params.file_path;
  }

  async execute(): Promise<ToolResult> {
    const { file_path, old_string, new_string, context_lines } = this.params;

    let content: string;
    try {
      content = await fs.readFile(file_path, 'utf-8');
    } catch {
      return {
        llmContent: [{ text: `Error: file not found: ${file_path}` }],
        returnDisplay: `Error: file not found: ${file_path}`,
        error: { message: `File not found: ${file_path}` },
      };
    }

    // Verify old_string exists in the file
    const idx = content.indexOf(old_string);
    if (idx === -1) {
      return {
        llmContent: [{ text: 'Error: old_string not found in file.' }],
        returnDisplay: 'Error: old_string not found in file.',
        error: { message: 'old_string not found in file' },
      };
    }

    // Check for ambiguous matches (multiple occurrences)
    const secondIdx = content.indexOf(old_string, idx + 1);
    if (secondIdx !== -1) {
      return {
        llmContent: [{ text: 'Error: old_string matches multiple locations. Provide more context to make it unique.' }],
        returnDisplay: 'Error: old_string matches multiple locations.',
        error: { message: 'old_string matches multiple locations' },
      };
    }

    // Apply the edit in memory
    const newContent = content.replace(old_string, new_string);

    // Generate unified diff
    const ctx = context_lines ?? 3;
    const patch = createPatch(file_path, content, newContent, '', '', { context: ctx });

    return {
      llmContent: [{ text: patch }],
      returnDisplay: patch,
    };
  }
}

export class DiffPreviewTool extends BaseDeclarativeTool<DiffPreviewParams, ToolResult> {
  static readonly Name: string = diffPreviewSchemaData.name!;

  constructor() {
    super(
      DiffPreviewTool.Name,
      'Diff Preview',
      diffPreviewSchemaData.description!,
      Kind.Read,
      diffPreviewSchemaData.parametersJsonSchema,
    );
  }

  protected createInvocation(params: DiffPreviewParams) {
    return new DiffPreviewInvocation(params);
  }
}
