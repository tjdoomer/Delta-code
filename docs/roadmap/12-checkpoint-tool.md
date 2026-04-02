# Model-Invokable Checkpoint/Undo + OpenBrain Ledger

## Branch: `feature/checkpoint-tool`

## Problem

Delta has a solid `/checkpoint` slash command (save/list/restore via git
snapshots), but the model can't invoke it. If the model writes broken code,
runs tests, and sees failures — it can't revert its own changes without the
user manually running `/checkpoint restore`.

Additionally, there's no persistent history of what changed across coding
sessions. Changes happen, but the reasoning behind them and the before/after
state is lost once the conversation ends.

## What it is

1. Expose checkpoint as a model-invokable tool (save, restore, list)
2. Log every checkpoint event to OpenBrain via `POST /api/capture` for a
   persistent, semantically-searchable change ledger across sessions

## Tool declarations

### `checkpoint_save`

```typescript
{
  name: 'checkpoint_save',
  description: 'Save a named checkpoint of the current workspace state. '
    + 'Use this before making risky changes so you can undo them. '
    + 'Also logs the checkpoint to the change ledger for future reference.',
  parameters: {
    type: 'object',
    properties: {
      label: {
        type: 'string',
        description: 'Short label describing the checkpoint state.',
      },
      reason: {
        type: 'string',
        description: 'Why you are saving this checkpoint (what are you about to do).',
      },
    },
    required: ['label'],
  },
}
```

### `checkpoint_restore`

```typescript
{
  name: 'checkpoint_restore',
  description: 'Restore a previously saved checkpoint, reverting all file '
    + 'changes since that checkpoint. Use this when your changes broke '
    + 'something and you need to start over from a known good state.',
  parameters: {
    type: 'object',
    properties: {
      label: {
        type: 'string',
        description: 'The checkpoint label to restore.',
      },
      reason: {
        type: 'string',
        description: 'Why you are reverting (what went wrong).',
      },
    },
    required: ['label'],
  },
}
```

### `checkpoint_list`

```typescript
{
  name: 'checkpoint_list',
  description: 'List all saved checkpoints with their labels and timestamps.',
  parameters: { type: 'object', properties: {} },
}
```

## OpenBrain Integration

Every checkpoint save and restore fires a `POST /api/capture` to OpenBrain:

```typescript
// On checkpoint_save
await fetch('http://localhost:8766/api/capture', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    room: 'delta-code',
    sender_id: 'delta-code',
    sender_name: 'Delta Code',
    sender_type: 'tool',
    content: `[CHECKPOINT SAVE] "${label}" — ${reason}\n\nFiles changed since last checkpoint:\n${changedFiles.join('\n')}`,
    metadata: {
      event_type: 'checkpoint_save',
      repo: repoName,
      branch: branchName,
      commit_sha: commitHash,
      label,
      reason,
      files_changed: changedFiles,
      timestamp: new Date().toISOString(),
    },
  }),
});

// On checkpoint_restore
await fetch('http://localhost:8766/api/capture', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    room: 'delta-code',
    sender_id: 'delta-code',
    sender_name: 'Delta Code',
    sender_type: 'tool',
    content: `[CHECKPOINT RESTORE] "${label}" — ${reason}\n\nReverted to state: ${commitHash.substring(0, 8)}`,
    metadata: {
      event_type: 'checkpoint_restore',
      repo: repoName,
      branch: branchName,
      restored_to_sha: commitHash,
      label,
      reason,
      timestamp: new Date().toISOString(),
    },
  }),
});
```

### Extended change tracking

Beyond checkpoints, log significant code changes automatically:

- **After each edit/write_file**: fire-and-forget capture with diff summary
- **On session start**: log which repo/branch, current HEAD
- **On session end**: log summary of all changes made

This builds a persistent timeline in OpenBrain:
```
GET /api/recent?room=delta-code&limit=20

→ [SESSION START] Delta-code on feature/auth-refactor @ abc1234
→ [EDIT] packages/core/src/auth.ts — refactored token validation
→ [CHECKPOINT SAVE] "before-migration" — about to change DB schema
→ [EDIT] packages/core/src/db/schema.ts — added session_tokens table
→ [RUN_TESTS] 12/14 passed, 2 failures in auth.test.ts
→ [CHECKPOINT RESTORE] "before-migration" — migration broke auth tests
→ [EDIT] packages/core/src/db/schema.ts — revised migration approach
→ [RUN_TESTS] 14/14 passed
→ [SESSION END] 6 files modified, 2 checkpoints used
```

Searchable via:
```
GET /api/search?q=migration+broke+auth

→ Returns the restore event + surrounding context
```

### OpenBrain availability

All OpenBrain calls are **fire-and-forget** — if OpenBrain isn't running
(localhost:8766 unreachable), log to local fallback file and skip silently.
No error surfaced to user or model. The coding session works identically
with or without OpenBrain.

Optionally write daily roll-up notes to Obsidian via
`POST /api/notes/upsert`:

```json
{
  "file_path": "Delta-code/2026-04-02.md",
  "content": "## Delta Code Session — 2026-04-02\n\n### Changes\n- ...",
  "folder": "delta-code"
}
```

## Self-correcting loop

With checkpoint + lint/test feedback (branch 9) + think tool (branch 7),
the model can:

1. `think` — plan the change
2. `checkpoint_save` — save known-good state
3. `multi_edit` — apply changes
4. `run_tests` — verify
5. If tests fail → `checkpoint_restore` → try again
6. All events logged to OpenBrain for cross-session learning

## Files to create
- `packages/core/src/tools/checkpoint.ts` — tool implementations
- `packages/core/src/tools/checkpoint.test.ts`
- `packages/core/src/services/openBrainClient.ts` — fire-and-forget HTTP client
- `packages/core/src/services/openBrainClient.test.ts`
- `packages/core/src/services/changeLedger.ts` — session tracking + auto-logging

## Files to modify
- `packages/core/src/config/config.ts` — register tools, add OpenBrain settings
- `packages/cli/src/config/settingsSchema.ts` — `openBrainUrl`, `enableChangeLedger`
- Optionally hook into edit/write_file tools for automatic change logging

## Dependencies
- Benefits from `feature/lint-test-feedback` (branch 9) for the full
  self-correcting loop, but works standalone for checkpoint/restore
- OpenBrain running at localhost:8766 (graceful degradation if absent)

## Effort: 3-5 days
