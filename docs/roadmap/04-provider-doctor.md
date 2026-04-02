# Provider Doctor / Bootstrap

## Branch: `feature/provider-doctor`

## Problem

When Delta fails to connect to a provider, the error surfaces deep in the
streaming loop with an unhelpful message. Users waste time debugging env vars,
API keys, base URLs, and network issues through trial and error.

## Approach (learned from OpenClaude)

OpenClaude has `bun run doctor:runtime` that validates env config and probes
endpoints before a session starts. It detects placeholder keys, missing keys
for non-local providers, and probes the actual API endpoint.

## Plan

### `/doctor` slash command

Runs these checks in sequence, reporting pass/warn/fail for each:

```
$ delta
> /doctor

  Provider Health Check
  ─────────────────────

  Environment
  ✓ OPENAI_BASE_URL    → http://localhost:1234/v1
  ✓ OPENAI_API_KEY     → set (lm-studio)
  ✗ ANTHROPIC_API_KEY  → not set
  ⚠ GEMINI_API_KEY     → looks like a placeholder (contains "YOUR_KEY")

  Connectivity
  ✓ LM Studio (localhost:1234)  → reachable, 2 models loaded
  ✗ Anthropic API               → no API key configured
  ─ Gemini API                  → skipped (placeholder key)

  Active Model
  ✓ qwen2.5-coder-32b via LM Studio
  ✓ Tool calling     → supported (probed)
  ✗ Vision           → not supported
  ✓ Streaming        → supported
  ⚠ Context window   → 32768 tokens (check model card)

  2 passed, 1 warning, 2 failed
```

### Checks to implement

1. **Env var scan**: Check all known API key env vars. Flag missing, empty,
   and placeholder values (common patterns: "YOUR_KEY", "sk-xxx", "SUA_CHAVE")
2. **Endpoint probe**: For each configured provider, send a lightweight request
   (list models or a minimal completion) with a 5s timeout
3. **Local service detection**: Check if Ollama (11434) or LM Studio (1234)
   are running, report loaded models
4. **Active model validation**: Verify the currently selected model is reachable
   and responds to a basic prompt
5. **Capability probe**: Quick tool-calling test against active model

### `--doctor` CLI flag

Also runnable as `delta --doctor` for pre-session validation without entering
the interactive REPL.

## Files to create
- `packages/core/src/diagnostics/providerDoctor.ts` — core diagnostic logic
- `packages/core/src/diagnostics/providerDoctor.test.ts`
- `packages/cli/src/ui/commands/doctorCommand.ts` — slash command

## Files to modify
- `packages/cli/src/services/BuiltinCommandLoader.ts` — register `/doctor`
- `packages/cli/src/nonInteractiveCli.ts` — add `--doctor` flag

## Dependencies
- Benefits from `feature/provider-registry` (can check all saved connections)
  but works standalone with env var detection
