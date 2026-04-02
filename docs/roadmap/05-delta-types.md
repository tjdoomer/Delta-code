# Decouple from @google/genai Types

## Branch: `refactor/delta-types`

## Problem

67 files import from `@google/genai`. Every provider converts to/from Google's
type system, which means:

- Google-specific concepts (`safetyRatings`, `promptFeedback`,
  `FinishReason.FINISH_REASON_UNSPECIFIED`) leak into non-Google responses as
  empty placeholders
- Provider-specific features (Anthropic citations, OpenAI structured outputs,
  think blocks) can't be represented without extending Google's types
- Tight coupling to a third-party type system makes upgrades risky — a breaking
  change in `@google/genai` ripples through the entire codebase

## Approach

Define Delta-native types as the canonical interchange format. Google types
become one translation layer among many, not the canonical truth.

## Plan

### Phase 1: Define `packages/core/src/types/delta.ts`

Core types that map to what Delta actually needs:

```typescript
// The Delta canonical message format — what flows between providers and the UI
interface DeltaMessage {
  role: 'user' | 'assistant' | 'system';
  parts: DeltaPart[];
}

type DeltaPart =
  | { type: 'text'; text: string }
  | { type: 'functionCall'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'functionResponse'; id: string; name: string; response: unknown }
  | { type: 'thinking'; text: string }           // reasoning models
  | { type: 'image'; mimeType: string; data: string }  // vision
  | { type: 'citation'; source: string; text: string }; // Anthropic citations etc.

interface DeltaResponse {
  id: string;
  model: string;
  parts: DeltaPart[];
  finishReason: DeltaFinishReason;
  usage?: DeltaUsage;
}

enum DeltaFinishReason {
  STOP = 'stop',
  MAX_TOKENS = 'max_tokens',
  TOOL_USE = 'tool_use',
  ERROR = 'error',
  UNSPECIFIED = 'unspecified',
}

interface DeltaUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens?: number;
}

interface DeltaToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

interface DeltaGenerateRequest {
  messages: DeltaMessage[];
  tools?: DeltaToolDeclaration[];
  systemPrompt?: string;
  config?: DeltaGenerateConfig;
}

interface DeltaGenerateConfig {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
}
```

### Phase 2: Create adapter layer per provider

```
packages/core/src/adapters/
  googleAdapter.ts    — DeltaMessage ↔ @google/genai types
  openaiAdapter.ts    — DeltaMessage ↔ OpenAI SDK types
  anthropicAdapter.ts — DeltaMessage ↔ Anthropic SDK types
```

Each adapter exports `toProviderFormat()` and `fromProviderFormat()`. The
content generators call these instead of doing inline conversion.

### Phase 3: Migrate ContentGenerator interface

Change the interface signature from Google types to Delta types:

```typescript
interface ContentGenerator {
  generateContent(request: DeltaGenerateRequest): Promise<DeltaResponse>;
  generateContentStream(request: DeltaGenerateRequest): AsyncGenerator<DeltaResponse>;
  countTokens(messages: DeltaMessage[]): Promise<number>;
}
```

### Phase 4: Migrate consumers (67 files)

This is the bulk of the work. Grep for all `@google/genai` imports and replace
with Delta types. The Google backend's adapter handles the actual SDK calls.

**Migration strategy**: do it file-by-file, keeping both type systems working
during the transition via a compatibility shim. Remove the shim once all files
are migrated.

## Files to create
- `packages/core/src/types/delta.ts` — canonical types
- `packages/core/src/adapters/googleAdapter.ts`
- `packages/core/src/adapters/openaiAdapter.ts`
- `packages/core/src/adapters/anthropicAdapter.ts`
- Tests for each adapter

## Scope warning

This is the largest refactor. It touches 67+ files. Should be done after
branches 1-4 are merged to avoid merge hell.

## Dependencies
- Should merge AFTER `fix/anthropic-provider` (branch 1) — otherwise the
  Anthropic adapter would be written against the broken raw-fetch implementation
- Should merge AFTER `feature/schema-normalization` (branch 2) — schema
  normalization can be built into the adapter layer cleanly
