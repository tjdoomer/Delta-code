# Lint / Test Feedback Tool

## Branch: `feature/lint-test-feedback`

## Problem

The model can run `shell("npm test")` but gets back raw terminal output. It has
to parse error messages, stack traces, and lint output from unstructured text.
Weaker models frequently misparse this and fix the wrong thing.

There's also no automatic feedback loop — the model writes code and moves on
unless the user tells it to test.

## What it is

A structured tool that:
1. Auto-detects the project's lint and test commands
2. Runs them and parses output into structured `{file, line, column, message, severity}` diagnostics
3. Returns a clean, actionable error list the model can iterate on

## Auto-detection logic

Scan the project root for known config files and extract commands:

| File | Lint command | Test command |
|------|-------------|--------------|
| `package.json` | `scripts.lint` or `npx eslint .` | `scripts.test` |
| `pyproject.toml` | `ruff check .` or `flake8 .` | `pytest` |
| `Cargo.toml` | `cargo clippy` | `cargo test` |
| `Makefile` | `make lint` (if target exists) | `make test` |
| `go.mod` | `golangci-lint run` | `go test ./...` |
| `Gemfile` | `rubocop` | `bundle exec rspec` |
| `.eslintrc.*` | `npx eslint .` | — |
| `tsconfig.json` | `npx tsc --noEmit` | — |

Fall back to user-configured commands in `.delta/settings.json`:

```json
{
  "lintCommand": "npm run lint",
  "testCommand": "npm run test",
  "testFilePattern": "**/*.test.ts"
}
```

## Tool declarations

### `lint`

```typescript
{
  name: 'lint',
  description: 'Run the project linter and return structured diagnostics. '
    + 'Auto-detects the lint command from project config. Returns errors '
    + 'as {file, line, column, message, severity} objects.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Optional: lint only this file or directory.',
      },
    },
  },
}
```

### `run_tests`

```typescript
{
  name: 'run_tests',
  description: 'Run project tests and return structured results. '
    + 'Auto-detects the test command from project config. Returns '
    + 'pass/fail per test with error details for failures.',
  parameters: {
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
  },
}
```

## Output format

```typescript
interface DiagnosticResult {
  command: string;        // what was actually run
  exitCode: number;
  diagnostics: Diagnostic[];
  summary: string;        // "3 errors, 2 warnings" or "12/14 tests passed"
}

interface Diagnostic {
  file: string;
  line: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  rule?: string;          // e.g. "no-unused-vars", "E501"
  source?: string;        // e.g. "eslint", "typescript", "pytest"
}
```

## Output parsers

Each linter/test runner has its own output format. Build parsers for:

- **ESLint** — use `--format json` flag (structured natively)
- **TypeScript (tsc)** — parse `file(line,col): error TS####: message`
- **pytest** — use `--tb=short` + parse traceback format
- **Rust (cargo)** — JSON output with `--message-format=json`
- **Go** — parse `file:line:col: message` format
- **Generic fallback** — regex for common `file:line: message` patterns

## Auto-run mode (optional)

Config flag `autoLintAfterEdit: true` — after every `write_file` or `edit`
tool call, automatically run lint and inject diagnostics into the next turn.
This creates the self-correcting feedback loop without the model having to
remember to call lint.

## Files to create
- `packages/core/src/tools/lint.ts` — lint tool
- `packages/core/src/tools/runTests.ts` — test runner tool
- `packages/core/src/tools/diagnostics/projectDetector.ts` — auto-detect commands
- `packages/core/src/tools/diagnostics/outputParsers.ts` — structured parsers
- `packages/core/src/tools/diagnostics/types.ts` — Diagnostic, DiagnosticResult
- Tests for each

## Files to modify
- `packages/core/src/config/config.ts` — register tools, add settings
- `packages/cli/src/config/settingsSchema.ts` — lintCommand, testCommand, autoLintAfterEdit

## Effort: 3-5 days
