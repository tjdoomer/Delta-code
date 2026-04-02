# Fix Anthropic Provider

## Branch: `fix/anthropic-provider`

## Problem

The `AnthropicContentGenerator` has three critical issues:

1. **Streaming tool calls are broken** — `streamGenerator()` (line 213) only handles
   `content_block_delta` with `delta.text`. When Claude returns `tool_use` blocks via
   streaming, the `partial_json` field is read but never assembled into complete
   `functionCall` parts. This means tool-calling via streaming silently drops tool
   invocations.

2. **Token counting is a rough guess** — `countTokens()` (line 286) uses
   `Math.ceil(content.length / 4)`. The `tiktoken` package is already in
   `package.json` but unused here. This breaks compression threshold calculations
   that depend on accurate counts.

3. **Raw fetch with no retries or rate-limit handling** — `makeRequest()` (line 113)
   is a bare `fetch` with no retry logic, no backoff on 429/529, no timeout control.
   The OpenAI generator uses the official SDK which handles all of this.

## Plan

### Phase 1: Replace raw fetch with `@anthropic-ai/sdk`
- Add `@anthropic-ai/sdk` to `packages/core/package.json`
- Rewrite `makeRequest()` to use `anthropic.messages.create()` and
  `anthropic.messages.stream()` — inherits retry, rate-limit, timeout handling
- Preserve existing telemetry logging (ApiResponseEvent / ApiErrorEvent)

### Phase 2: Fix streaming tool calls
- Track active tool_use blocks by index in a Map (same pattern as OpenAI generator's
  `streamingToolCalls` Map at openaiContentGenerator.ts:98)
- On `content_block_start` with `type: "tool_use"`: create entry with id + name
- On `content_block_delta` with `type: "input_json_delta"`: append partial_json
- On `content_block_stop`: parse assembled JSON, yield a GenerateContentResponse
  with `functionCall` part
- Handle `stop_reason: "tool_use"` → map to appropriate FinishReason

### Phase 3: Fix token counting
- Import `tiktoken` (already a dependency)
- Use `encoding_for_model("cl100k_base")` for Claude models
- Fall back to current heuristic only if tiktoken fails

### Phase 4: Add Anthropic-specific features
- Support `anthropic-version` header updates (currently hardcoded to 2023-06-01)
- Pass through `max_tokens` properly (current default 4096 is low for Claude 3.5+)

## Files to modify
- `packages/core/package.json` — add `@anthropic-ai/sdk`
- `packages/core/src/core/anthropicContentGenerator.ts` — full rewrite
- `packages/core/src/core/contentGenerator.ts` — potentially extend
  `ContentGeneratorConfig` with Anthropic-specific fields

## Testing
- Unit test: streaming generator yields functionCall parts for tool_use blocks
- Unit test: token counting returns reasonable values (not char/4)
- Integration test: multi-turn tool-calling conversation completes
