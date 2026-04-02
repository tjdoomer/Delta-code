# Per-Provider Tool Schema Normalization

## Branch: `feature/schema-normalization`

## Problem

Tool declarations flow through `@google/genai` types and are sent as-is to
non-Google providers. Different providers have different schema requirements:

- **OpenAI strict mode**: every object needs `additionalProperties: false` and
  every property must appear in `required[]`
- **Gemini**: rejects `required` keys for properties absent from `properties` —
  the opposite of OpenAI's strict mode
- **Anthropic**: generally permissive but ignores unknown schema fields
- **Local models (LM Studio, Ollama)**: vary wildly — some crash on
  `additionalProperties`, some require it

Without normalization, tool calling silently fails or parameters get stripped
on models that enforce stricter schemas.

## Approach (learned from OpenClaude)

OpenClaude's `enforceStrictSchema()` recursively walks tool parameter schemas to
satisfy provider requirements. We should build a similar but provider-aware system.

## Plan

### Create `packages/core/src/tools/schemaNormalizer.ts`

```
normalizeSchemaForProvider(schema, providerType) → normalized schema
```

Provider-specific transforms:

| Provider     | Transform                                                     |
|-------------|---------------------------------------------------------------|
| OpenAI      | Add `additionalProperties: false` to all objects, promote all |
|             | properties to `required[]`, handle `anyOf/oneOf/allOf` combos |
| Gemini      | Strip `required` for absent properties, set `strict: false`   |
| Anthropic   | Pass through (permissive), strip unknown fields               |
| LM Studio   | Same as OpenAI (uses OpenAI-compatible API)                   |
| Ollama      | Same as OpenAI, but drop empty object schemas entirely        |

### Hook into tool conversion in each content generator

- `openaiContentGenerator.ts` — apply before building `tools` array in
  `convertToOpenAIFormat()`
- `anthropicContentGenerator.ts` — apply before building `tools` in
  `convertToAnthropicFormat()`
- Google generators — no change needed (native format)

### Handle nested schemas recursively
- Walk `properties` → normalize each child
- Walk `items` (array schemas) → normalize
- Walk combinators (`anyOf`, `oneOf`, `allOf`) → normalize each branch
- Drop empty `{}` object schemas that would cause silent stripping

## Files to create
- `packages/core/src/tools/schemaNormalizer.ts`
- `packages/core/src/tools/schemaNormalizer.test.ts`

## Files to modify
- `packages/core/src/core/openaiContentGenerator.ts` — import and apply normalizer
- `packages/core/src/core/anthropicContentGenerator.ts` — import and apply normalizer

## Testing
- Unit tests with known-problematic schemas (nested objects, combinators, empty objects)
- Verify tool calls succeed on OpenAI, Anthropic, and a local Ollama model
