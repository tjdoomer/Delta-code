# Provider Registry & Model Switching

## Branch: `feature/provider-registry`

## Problem

Currently each provider is configured via env vars that must be set before launch.
Switching between providers mid-session requires restarting with different env vars.
The `/model` command only lists hardcoded model names per auth type — no dynamic
discovery, no credential persistence, no way to switch providers at runtime.

For local model workflows (LM Studio, Ollama), users must manually set
`OPENAI_BASE_URL` and `OPENAI_MODEL` every time.

## Vision

A persistent provider registry that:
1. Saves credentials per connection method once (`~/.delta/providers.json`)
2. Auto-discovers local models via LM Studio API (`localhost:1234/v1/models`)
   and Ollama API (`localhost:11434/api/tags`)
3. Maintains a capability table per model (tool calling, vision, streaming, context window)
4. Lets you switch between any saved provider/model with `/model` at runtime

## Design

### Provider Registry (`~/.delta/providers.json`)

```json
{
  "connections": [
    {
      "id": "lmstudio-local",
      "type": "openai-compatible",
      "name": "LM Studio",
      "baseUrl": "http://localhost:1234/v1",
      "apiKey": "lm-studio",
      "autoDiscover": true
    },
    {
      "id": "ollama-local",
      "type": "openai-compatible",
      "name": "Ollama",
      "baseUrl": "http://localhost:11434/v1",
      "autoDiscover": true
    },
    {
      "id": "openai-cloud",
      "type": "openai",
      "name": "OpenAI",
      "apiKey": "sk-...",
      "autoDiscover": false
    },
    {
      "id": "anthropic-cloud",
      "type": "anthropic",
      "name": "Anthropic",
      "apiKey": "sk-ant-...",
      "autoDiscover": false
    }
  ],
  "defaultConnection": "lmstudio-local",
  "defaultModel": "qwen2.5-coder-32b"
}
```

### Capability Table (`~/.delta/model-capabilities.json`)

Populated on first use of each model, updated on `/model refresh`:

```json
{
  "qwen2.5-coder-32b": {
    "connection": "lmstudio-local",
    "capabilities": {
      "toolCalling": true,
      "vision": false,
      "streaming": true,
      "contextWindow": 32768,
      "thinkBlocks": false
    },
    "lastProbed": "2026-04-02T10:00:00Z"
  }
}
```

Capability detection: send a minimal tool-calling request and see if the model
returns a valid function_call. Cache the result. This avoids the guessing game.

### Enhanced `/model` command

```
/model                     → show current model + connection
/model list                → show all available models across all connections
/model list lmstudio       → show models from LM Studio connection only
/model set <model>         → switch to model (auto-resolves connection)
/model add                 → interactive: add a new connection
/model remove <connection> → remove a saved connection
/model refresh             → re-probe all connections, update capability table
/model capabilities        → show capability table for available models
```

### LM Studio Auto-Discovery

When a connection has `autoDiscover: true` and `baseUrl` pointing at LM Studio:

1. `GET {baseUrl}/models` → returns loaded models with metadata
2. Parse model names, context lengths, capabilities from response
3. Populate capability table entries
4. If only one model is loaded, auto-select it
5. If multiple, show picker

Same pattern for Ollama via `GET {baseUrl}/api/tags`.

## Plan

### Phase 1: Provider registry
- Create `packages/core/src/config/providerRegistry.ts`
  - `ProviderConnection` type, `ProviderRegistry` class
  - Load/save `~/.delta/providers.json`
  - CRUD operations for connections
- Create `packages/core/src/config/modelCapabilities.ts`
  - `ModelCapability` type, capability probing logic
  - Load/save `~/.delta/model-capabilities.json`

### Phase 2: LM Studio + Ollama discovery
- Create `packages/core/src/providers/localModelDiscovery.ts`
  - `discoverLMStudioModels(baseUrl)` — GET /v1/models
  - `discoverOllamaModels(baseUrl)` — GET /api/tags
  - Normalize both to `DiscoveredModel[]`

### Phase 3: Enhanced /model command
- Rewrite `packages/cli/src/ui/commands/modelCommand.ts`
  - Replace hardcoded `MODEL_LISTS` with registry-backed discovery
  - Add `add`, `remove`, `refresh`, `capabilities` subcommands
  - Auto-complete from registry + discovered models

### Phase 4: Runtime provider switching
- Modify `contentGenerator.ts` factory to accept connection ID
- Allow `Config.setModel()` to trigger content generator recreation
- Wire through to the streaming hooks so mid-conversation switches work

## Files to create
- `packages/core/src/config/providerRegistry.ts`
- `packages/core/src/config/modelCapabilities.ts`
- `packages/core/src/providers/localModelDiscovery.ts`
- Tests for each

## Files to modify
- `packages/cli/src/ui/commands/modelCommand.ts` — full rewrite
- `packages/core/src/core/contentGenerator.ts` — factory accepts connection
- `packages/core/src/agents/resourceProbe.ts` — use registry instead of hardcoded API_MODELS
- `packages/cli/src/ui/components/AuthDialog.tsx` — offer saved connections

## Dependencies
- None (can be built independently of other branches)
