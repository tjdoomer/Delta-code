/**
 * File summary tool — returns only the structural skeleton of a file:
 * exports, class declarations, method signatures, type definitions.
 * No function bodies. A 2000-line file becomes ~50 lines.
 *
 * Uses regex-based extraction (no tree-sitter dependency). When the
 * repo-map branch lands with tree-sitter, this can be upgraded to use
 * the shared AST extraction layer for better accuracy.
 */

import {
  FunctionDeclaration,
} from '../types/delta.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolResult,
} from './tools.js';

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

interface FileSummaryParams {
  path: string;
  include_docstrings?: boolean;
  include_private?: boolean;
}

const fileSummarySchemaData: FunctionDeclaration = {
  name: 'read_file_summary',
  description:
    'Get a structural summary of a file: exports, class declarations, method signatures, and type definitions. No function bodies. Use this instead of read_file when you need to understand a file\'s interface without reading all the code. ~95% fewer tokens than reading the full file.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the file.',
      },
      include_docstrings: {
        type: 'boolean',
        description: 'Include docstrings/JSDoc comments (default true).',
      },
      include_private: {
        type: 'boolean',
        description: 'Include private/internal members (default false).',
      },
    },
    required: ['path'],
    $schema: 'http://json-schema.org/draft-07/schema#',
  },
};

// Regex patterns for extracting structural elements by language
// These intentionally capture signatures without bodies

function extractTypeScriptSignatures(content: string, includePrivate: boolean): string[] {
  const lines: string[] = [];
  const patterns = [
    // Imports (first few for dependency context)
    /^import\s+.*from\s+['"].*['"]/gm,
    // Export declarations
    /^export\s+(?:default\s+)?(?:class|interface|type|enum|function|const|let|var|abstract\s+class)\s+\w+[^{]*/gm,
    // Class declarations
    /^(?:export\s+)?(?:abstract\s+)?class\s+\w+(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?/gm,
    // Interface declarations
    /^(?:export\s+)?interface\s+\w+(?:\s+extends\s+[\w,\s]+)?/gm,
    // Type declarations
    /^(?:export\s+)?type\s+\w+\s*=/gm,
    // Enum declarations
    /^(?:export\s+)?enum\s+\w+/gm,
    // Method signatures (inside classes)
    /^\s+(?:(?:public|protected|private|static|async|override|readonly|abstract)\s+)*\w+\s*\([^)]*\)\s*(?::\s*[^{]+)?/gm,
    // Function declarations
    /^(?:export\s+)?(?:async\s+)?function\s+\w+\s*\([^)]*\)\s*(?::\s*[^{]+)?/gm,
    // Const arrow functions
    /^(?:export\s+)?const\s+\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^=]+)?=>/gm,
  ];

  const seen = new Set<string>();

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      let line = match[0].trim();

      // Skip private members unless requested
      if (!includePrivate && /^\s*private\s+/.test(line)) continue;

      // Clean up: remove trailing { and whitespace
      line = line.replace(/\s*\{?\s*$/, '').trim();

      if (line && !seen.has(line)) {
        seen.add(line);
        lines.push(line);
      }
    }
  }

  return lines;
}

function extractPythonSignatures(content: string, includePrivate: boolean): string[] {
  const lines: string[] = [];
  const patterns = [
    // Imports
    /^(?:from\s+\S+\s+)?import\s+.+$/gm,
    // Class declarations
    /^class\s+\w+(?:\(.*?\))?\s*:/gm,
    // Function/method definitions
    /^(?:\s*)(?:async\s+)?def\s+\w+\s*\([^)]*\)(?:\s*->\s*\S+)?\s*:/gm,
    // Decorators
    /^\s*@\w+(?:\(.*?\))?$/gm,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const line = match[0].trimEnd();
      if (!includePrivate && /def\s+__(?!init__|str__|repr__)/.test(line)) continue;
      if (!includePrivate && /def\s+_[a-z]/.test(line)) continue;
      lines.push(line);
    }
  }

  return lines;
}

function extractGenericSignatures(content: string): string[] {
  // Fallback: extract lines that look like declarations
  const lines: string[] = [];
  const patterns = [
    /^(?:pub\s+)?(?:fn|func|function|def|class|struct|enum|trait|impl|interface|type)\s+.+$/gm,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      lines.push(match[0].replace(/\s*\{?\s*$/, '').trim());
    }
  }

  return lines;
}

class FileSummaryInvocation extends BaseToolInvocation<FileSummaryParams, ToolResult> {
  getDescription(): string {
    return this.params.path;
  }

  async execute(): Promise<ToolResult> {
    const filePath = this.params.path;
    const includePrivate = this.params.include_private ?? false;

    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      return {
        llmContent: [{ text: `Error: file not found: ${filePath}` }],
        returnDisplay: `Error: file not found: ${filePath}`,
        error: { message: `File not found: ${filePath}` },
      };
    }

    const ext = path.extname(filePath).toLowerCase();
    let signatures: string[];

    switch (ext) {
      case '.ts':
      case '.tsx':
      case '.js':
      case '.jsx':
      case '.mjs':
      case '.cjs':
        signatures = extractTypeScriptSignatures(content, includePrivate);
        break;
      case '.py':
        signatures = extractPythonSignatures(content, includePrivate);
        break;
      default:
        signatures = extractGenericSignatures(content);
        break;
    }

    const totalLines = content.split('\n').length;

    if (signatures.length === 0) {
      const msg = `${filePath} (${totalLines} lines) — no structural elements extracted.`;
      return {
        llmContent: [{ text: msg }],
        returnDisplay: msg,
      };
    }

    const header = `// ${filePath} (${totalLines} lines → ${signatures.length} signatures)`;
    const summary = [header, '', ...signatures].join('\n');

    return {
      llmContent: [{ text: summary }],
      returnDisplay: summary,
    };
  }
}

export class FileSummaryTool extends BaseDeclarativeTool<FileSummaryParams, ToolResult> {
  static readonly Name: string = fileSummarySchemaData.name!;

  constructor() {
    super(
      FileSummaryTool.Name,
      'File Summary',
      fileSummarySchemaData.description!,
      Kind.Read,
      fileSummarySchemaData.parametersJsonSchema,
    );
  }

  protected createInvocation(params: FileSummaryParams) {
    return new FileSummaryInvocation(params);
  }
}
