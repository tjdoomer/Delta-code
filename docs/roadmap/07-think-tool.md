# Think / Plan Tool

## Branch: `feature/think-tool`

## Problem

Local models (7B-32B running on LM Studio) make impulsive tool calls — they
jump straight to editing without understanding the problem. Larger API models
do this too but less often. There's no mechanism to force structured reasoning
before acting.

Delta has `Kind.Think` in its enum but no actual tool backing it.

## What it is

A no-op tool that accepts the model's reasoning and returns it back into context.
No side effects. The model calls it to think before it acts.

```
Model → think({ reasoning: "The user wants X. I see files A, B, C are involved.
  The dependency chain is A→B→C. I should modify B first because..." })
← Returns the same text back into context
```

## Why it works

Research on process reward models shows that models which checkpoint reasoning
mid-task make fewer cascading errors. For weaker models this is even more
pronounced — a 7B model that plans before acting outperforms the same model
that jumps straight to edits.

## Implementation

### Tool declaration

```typescript
{
  name: 'think',
  description: 'Use this tool to plan your approach before taking action. '
    + 'Write out your reasoning about the problem, what files are involved, '
    + 'what changes are needed, and in what order. This helps you avoid '
    + 'mistakes by thinking before acting. The output is returned to you '
    + 'for reference — no side effects occur.',
  parameters: {
    type: 'object',
    properties: {
      reasoning: {
        type: 'string',
        description: 'Your structured reasoning about the current task.',
      },
    },
    required: ['reasoning'],
  },
}
```

### Tool implementation

```typescript
// The entire tool is ~10 lines
async execute({ reasoning }: { reasoning: string }): Promise<string> {
  return reasoning;
}
```

### System prompt integration

Add to the system prompt for weaker models (configurable):

> Before making changes to code, use the `think` tool to plan your approach.
> Outline which files need to change, in what order, and why. This is
> especially important for multi-file changes.

### Optional: structured think mode

For models that support it, enforce a schema:

```typescript
{
  goal: string;
  files_involved: string[];
  steps: string[];
  risks: string[];
  current_step: number;
}
```

This could be a `think_structured` variant or a config flag.

## Files to create
- `packages/core/src/tools/think.ts` — tool implementation
- `packages/core/src/tools/think.test.ts`

## Files to modify
- `packages/core/src/config/config.ts` — register tool in `registerCoreTool()`
- `packages/core/src/core/prompts.ts` — add think guidance to system prompt
  (gated on config flag or model capability)

## Effort: ~1 hour
