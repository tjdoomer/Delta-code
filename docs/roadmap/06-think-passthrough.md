# Think Block Passthrough

## Branch: `feature/think-passthrough`

## Problem

The OpenAI generator (openaiContentGenerator.ts:537-593) has a `filterThinkTags()`
method that **strips** `<think>...</think>` blocks from streaming output. For
non-streaming, it does `content.replace(/<think>[\s\S]*?<\/think>/g, '')` at
line 1355.

This means reasoning traces from models like DeepSeek-R1, QwQ, Qwen3-coder,
and others are silently discarded. Users running these models via LM Studio
can't see the chain-of-thought that makes them useful.

The Anthropic generator doesn't handle think blocks at all.

## What OpenClaude does

Wraps `thinking` blocks in `<thinking>` XML tags and passes them as text content.
Simple, but it at least surfaces the reasoning.

## Better approach for Delta

Rather than stripping or flattening, treat think blocks as a first-class part
type. This pairs naturally with the `DeltaPart` types from branch 5, but can
be implemented independently with the current type system.

## Plan

### Phase 1: Surface think blocks in streaming (OpenAI generator)

- Replace `filterThinkTags()` stripping logic with a **think block extractor**
- When a `<think>` tag opens: buffer content into a separate think accumulator
- When `</think>` closes: yield the buffered content as a think part
- Keep the stateful cross-chunk handling (it's well-implemented, just pointed
  at the wrong outcome)

For the current `@google/genai` type system, represent think parts as:
```typescript
{ text: '', thought: true }  // extend Part with metadata
```
Or use the `customMetadata` escape hatch on Part if available.

### Phase 2: Surface think blocks in non-streaming (OpenAI generator)

- Replace the regex strip at line 1355 with extraction
- Parse out all `<think>...</think>` blocks, emit as separate parts

### Phase 3: Handle Anthropic extended thinking

When/if we adopt the Anthropic SDK (branch 1), Claude's `thinking` content
blocks are returned natively — no XML parsing needed. Map them through.

### Phase 4: UI rendering

- `packages/cli/src/ui/` — render think blocks in a collapsible/dimmed style
- Show them by default (reasoning is the point), but respect a config flag
  `showThinking: true|false` for users who want clean output
- Consider a `/thinking` toggle command

### Phase 5: Anthropic generator

- Handle `thinking` type content blocks in the streaming SSE parser
- Map to the same think part representation

## Files to modify
- `packages/core/src/core/openaiContentGenerator.ts` — replace filterThinkTags,
  modify convertStreamChunkToGenAIFormat and convertToGenAIFormat
- `packages/core/src/core/anthropicContentGenerator.ts` — handle thinking blocks
- `packages/cli/src/ui/` — render think parts (identify exact component)
- `packages/cli/src/config/settingsSchema.ts` — add `showThinking` setting

## Files to create
- `packages/core/src/utils/thinkBlockParser.ts` — shared parser for XML think tags
- `packages/core/src/utils/thinkBlockParser.test.ts`

## Dependencies
- Independent of other branches, but aligns naturally with branch 5 (delta types
  would include `{ type: 'thinking'; text: string }` as a first-class DeltaPart)
