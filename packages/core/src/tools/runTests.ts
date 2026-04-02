/**
 * Test runner tool — auto-detect and run project tests with structured output.
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
interface RunTestsParams {
  path?: string;
  filter?: string;
}

const runTestsSchemaData: FunctionDeclaration = {
  name: 'run_tests',
  description:
    'Run project tests and return structured results. Auto-detects the test command from project config (package.json, pyproject.toml, Cargo.toml, etc). Returns pass/fail with error details for failures.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Optional: run tests for this file/directory only.',
      },
      filter: {
        type: 'string',
        description: 'Optional: filter test names matching this pattern.',
      },
    },
    $schema: 'http://json-schema.org/draft-07/schema#',
  },
};

class RunTestsInvocation extends BaseToolInvocation<RunTestsParams, ToolResult> {
  constructor(params: RunTestsParams, private projectRoot: string) {
    super(params);
  }

  getDescription(): string {
    if (this.params.path) return `Test ${this.params.path}`;
    if (this.params.filter) return `Test matching "${this.params.filter}"`;
    return 'Run tests';
  }

  async execute(): Promise<ToolResult> {
    const detected = detectProjectCommands(this.projectRoot);
    const command = detected.test;

    if (!command) {
      return {
        llmContent: [{ text: 'No test command detected. Configure one in package.json scripts.' }],
        returnDisplay: 'No test command detected.',
        error: { message: 'No test command detected' },
      };
    }

    // Build the full command with optional path/filter
    let fullCommand = command;
    if (this.params.path) fullCommand += ` ${this.params.path}`;
    if (this.params.filter) fullCommand += ` -t "${this.params.filter}"`;

    let stdout = '';
    let stderr = '';
    let exitCode = 0;

    try {
      const output = execSync(fullCommand, {
        cwd: this.projectRoot,
        timeout: 120_000,
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

    // Return raw output — test runners often have their own formatting
    const truncated = rawOutput.length > 3000
      ? rawOutput.substring(0, 3000) + '\n... (truncated)'
      : rawOutput;

    const summary = exitCode === 0
      ? `Tests passed (${fullCommand}):\n${truncated}`
      : `Tests failed (exit ${exitCode}, ${fullCommand}):\n${truncated}`;

    return {
      llmContent: [{ text: summary }],
      returnDisplay: summary,
    };
  }
}

export class RunTestsTool extends BaseDeclarativeTool<RunTestsParams, ToolResult> {
  static readonly Name: string = runTestsSchemaData.name!;

  constructor() {
    super(
      RunTestsTool.Name,
      'Run Tests',
      runTestsSchemaData.description!,
      Kind.Execute,
      runTestsSchemaData.parametersJsonSchema,
    );
  }

  protected createInvocation(params: RunTestsParams) {
    return new RunTestsInvocation(params, process.cwd());
  }
}
