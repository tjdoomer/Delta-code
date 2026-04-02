/**
 * Multi-edit tool — apply multiple edits across one or more files atomically.
 *
 * All edits are validated before any are applied. If any edit fails validation
 * (file not found, old_string not found, ambiguous match), none are applied.
 * This prevents partial refactors that leave the codebase in a broken state.
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolResult,
} from './tools.js';
import { FunctionDeclaration } from '@google/genai';
import * as fs from 'node:fs/promises';

interface EditEntry {
  file_path: string;
  old_string: string;
  new_string: string;
}

interface MultiEditParams {
  edits: EditEntry[];
}

const multiEditSchemaData: FunctionDeclaration = {
  name: 'multi_edit',
  description:
    'Apply multiple edits across one or more files in a single atomic operation. All edits are validated before any are applied — if any edit fails validation, none are applied. Use this for refactors that touch multiple files.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      edits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'Absolute path to the file.' },
            old_string: { type: 'string', description: 'The exact text to be replaced.' },
            new_string: { type: 'string', description: 'The replacement text.' },
          },
          required: ['file_path', 'old_string', 'new_string'],
        },
        description: 'Array of edits. Each specifies file, old text, new text.',
      },
    },
    required: ['edits'],
    $schema: 'http://json-schema.org/draft-07/schema#',
  },
};

class MultiEditInvocation extends BaseToolInvocation<MultiEditParams, ToolResult> {
  getDescription(): string {
    const files = new Set(this.params.edits.map(e => e.file_path));
    return `${this.params.edits.length} edit(s) across ${files.size} file(s)`;
  }

  // Confirmation is handled by the base class (returns false = no confirmation).
  // Multi-edit is validated atomically — if any edit would fail, none are applied.

  async execute(): Promise<ToolResult> {
    const edits = this.params.edits;

    if (!edits || edits.length === 0) {
      return {
        llmContent: [{ text: 'Error: no edits provided.' }],
        returnDisplay: 'Error: no edits provided.',
        error: { message: 'No edits provided' },
      };
    }

    // Phase 1: Read all files and validate every edit
    const fileContents = new Map<string, string>();
    const errors: string[] = [];

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];

      // Read file if not already cached
      if (!fileContents.has(edit.file_path)) {
        try {
          const content = await fs.readFile(edit.file_path, 'utf-8');
          fileContents.set(edit.file_path, content);
        } catch {
          errors.push(`Edit ${i + 1}: file not found: ${edit.file_path}`);
          continue;
        }
      }

      const content = fileContents.get(edit.file_path)!;
      const idx = content.indexOf(edit.old_string);

      if (idx === -1) {
        errors.push(`Edit ${i + 1}: old_string not found in ${edit.file_path}`);
      } else {
        const secondIdx = content.indexOf(edit.old_string, idx + 1);
        if (secondIdx !== -1) {
          errors.push(`Edit ${i + 1}: old_string matches multiple locations in ${edit.file_path}`);
        }
      }
    }

    // If any validation failed, abort all edits
    if (errors.length > 0) {
      const msg = `Validation failed — no edits applied:\n${errors.join('\n')}`;
      return {
        llmContent: [{ text: msg }],
        returnDisplay: msg,
        error: { message: msg },
      };
    }

    // Phase 2: Apply all edits (validated, safe to proceed)
    // Group edits by file and apply sequentially within each file
    const editsByFile = new Map<string, EditEntry[]>();
    for (const edit of edits) {
      if (!editsByFile.has(edit.file_path)) {
        editsByFile.set(edit.file_path, []);
      }
      editsByFile.get(edit.file_path)!.push(edit);
    }

    const modifiedFiles: string[] = [];

    for (const [filePath, fileEdits] of editsByFile) {
      let content = fileContents.get(filePath)!;

      for (const edit of fileEdits) {
        content = content.replace(edit.old_string, edit.new_string);
      }

      await fs.writeFile(filePath, content, 'utf-8');
      modifiedFiles.push(filePath);
    }

    const summary = `Applied ${edits.length} edit(s) to ${modifiedFiles.length} file(s):\n${modifiedFiles.map(f => `  - ${f}`).join('\n')}`;

    return {
      llmContent: [{ text: summary }],
      returnDisplay: summary,
    };
  }
}

export class MultiEditTool extends BaseDeclarativeTool<MultiEditParams, ToolResult> {
  static readonly Name: string = multiEditSchemaData.name!;

  constructor() {
    super(
      MultiEditTool.Name,
      'Multi Edit',
      multiEditSchemaData.description!,
      Kind.Edit,
      multiEditSchemaData.parametersJsonSchema,
    );
  }

  protected createInvocation(params: MultiEditParams) {
    return new MultiEditInvocation(params);
  }
}
