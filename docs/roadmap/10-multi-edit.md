# Multi-Edit / Batch Tool

## Branch: `feature/multi-edit`

## Problem

Multi-file refactors require N sequential tool calls — one per file edit. Each
call is a full round-trip through the model. For local models with high latency
per turn (2-10s on LM Studio), a 5-file rename takes 10-50 seconds of pure
model overhead.

The model also has to maintain context about what it already changed across
multiple turns, increasing the chance of inconsistencies.

## What it is

Two tools:

### `multi_edit` — batch file edits in one call

```typescript
{
  name: 'multi_edit',
  description: 'Apply multiple edits across one or more files in a single '
    + 'operation. All edits are validated before any are applied. If any '
    + 'edit fails validation, none are applied (atomic). Use this for '
    + 'refactors that touch multiple files.',
  parameters: {
    type: 'object',
    properties: {
      edits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
            old_string: { type: 'string' },
            new_string: { type: 'string' },
          },
          required: ['file_path', 'old_string', 'new_string'],
        },
        description: 'Array of edits. Each specifies file, old text, new text.',
      },
    },
    required: ['edits'],
  },
}
```

### `batch` — run multiple tool calls in one request

```typescript
{
  name: 'batch',
  description: 'Execute multiple tool calls in a single operation. '
    + 'Read-only tools run in parallel. Write tools run sequentially. '
    + 'Use this to reduce round-trips when you need to read multiple '
    + 'files or perform independent operations.',
  parameters: {
    type: 'object',
    properties: {
      calls: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tool: { type: 'string', description: 'Tool name' },
            args: { type: 'object', description: 'Tool arguments' },
          },
          required: ['tool', 'args'],
        },
      },
    },
    required: ['calls'],
  },
}
```

## Implementation

### multi_edit

1. Parse all edits
2. **Validation pass**: for each edit, verify file exists and `old_string` is
   found exactly once (same as existing edit tool)
3. If all pass → apply all edits
4. If any fail → return error with which edits failed and why, apply nothing
5. Return summary: `{ applied: 5, files_modified: ['a.ts', 'b.ts', 'c.ts'] }`

### batch

1. Classify each call: read-only (`read_file`, `glob`, `grep`, `ls`, `repo_map`)
   vs. write (`edit`, `write_file`, `shell`)
2. Run all read-only calls in parallel via `Promise.all()`
3. Run write calls sequentially in order
4. Return all results as an array matching the input order
5. If a write call fails, stop and return partial results + error

### Safety

- `multi_edit` gets the same user confirmation gate as single edits
- `batch` inherits confirmation from its constituent tools — if any call
  requires confirmation, the batch pauses
- Maximum batch size: 20 calls (prevent runaway)

## Files to create
- `packages/core/src/tools/multiEdit.ts`
- `packages/core/src/tools/batch.ts`
- `packages/core/src/tools/multiEdit.test.ts`
- `packages/core/src/tools/batch.test.ts`

## Files to modify
- `packages/core/src/config/config.ts` — register tools
- `packages/core/src/tools/tool-registry.ts` — add read-only classification
  method (`isReadOnly(toolName)`) for batch parallelization

## Effort: 3-5 days
