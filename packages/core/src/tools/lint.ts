/**
 * Lint tool — auto-detect and run the project linter with structured output.
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

import { execSync } from 'node:child_process';
import { detectProjectCommands } from './diagnostics/projectDetector.js';
import { parseGenericDiagnostics, formatDiagnostics } from './diagnostics/outputParsers.js';
interface LintParams {
  path?: string;
}

const lintSchemaData: FunctionDeclaration = {
  name: 'lint',
  description:
    'Run the project linter and return structured diagnostics. Auto-detects the lint command from project config (package.json, pyproject.toml, Cargo.toml, etc). Returns errors as file:line:message entries.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Optional: lint only this file or directory.',
      },
    },
    $schema: 'http://json-schema.org/draft-07/schema#',
  },
};

class LintInvocation extends BaseToolInvocation<LintParams, ToolResult> {
  constructor(params: LintParams, private projectRoot: string) {
    super(params);
  }

  getDescription(): string {
    return this.params.path ? `Lint ${this.params.path}` : 'Lint project';
  }

  async execute(): Promise<ToolResult> {
    const detected = detectProjectCommands(this.projectRoot);
    const command = detected.lint;

    if (!command) {
      return {
        llmContent: [{ text: 'No lint command detected. Configure one in package.json scripts or add a .eslintrc file.' }],
        returnDisplay: 'No lint command detected.',
        error: { message: 'No lint command detected' },
      };
    }

    const fullCommand = this.params.path ? `${command} ${this.params.path}` : command;

    let stdout = '';
    let stderr = '';
    let exitCode = 0;

    try {
      const output = execSync(fullCommand, {
        cwd: this.projectRoot,
        timeout: 60_000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      stdout = output || '';
    } catch (err: unknown) {
      const execError = err as { stdout?: string; stderr?: string; status?: number };
      stdout = execError.stdout || '';
      stderr = execError.stderr || '';
      exitCode = execError.status || 1;
    }

    const rawOutput = (stdout + '\n' + stderr).trim();
    const diagnostics = parseGenericDiagnostics(rawOutput);

    if (diagnostics.length > 0) {
      const formatted = formatDiagnostics(diagnostics, fullCommand, exitCode);
      return {
        llmContent: [{ text: formatted }],
        returnDisplay: formatted,
      };
    }

    // No structured diagnostics parsed — return raw output
    const summary = exitCode === 0
      ? `Lint passed (${fullCommand})`
      : `Lint failed (exit ${exitCode}):\n${rawOutput.substring(0, 2000)}`;

    return {
      llmContent: [{ text: summary }],
      returnDisplay: summary,
    };
  }
}

export class LintTool extends BaseDeclarativeTool<LintParams, ToolResult> {
  static readonly Name: string = lintSchemaData.name!;

  constructor() {
    super(
      LintTool.Name,
      'Lint',
      lintSchemaData.description!,
      Kind.Execute,
      lintSchemaData.parametersJsonSchema,
    );
  }

  protected createInvocation(params: LintParams) {
    return new LintInvocation(params, process.cwd());
  }
}
