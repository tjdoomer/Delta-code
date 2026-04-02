# Delta Code

<img width="317" height="124" alt="Screenshot 2026-04-03 at 12 19 31 am" src="https://github.com/user-attachments/assets/49e20679-9214-48fd-be69-6bfd9f0ce25e" />


AI-powered coding agent for the terminal. Any model. Every tool. Zero lock-in.

Delta Code connects to any LLM provider — local models via LM Studio/Ollama, OpenAI, Anthropic, Google, Azure, or any OpenAI-compatible endpoint — and gives the model a rich set of coding tools: file editing, search, shell execution, linting, testing, codebase navigation, and more.

Switch providers mid-conversation. Plan with a cloud model, implement with a local one. Your context carries over.

## Install

Requires Node.js >= 20.

```bash
git clone https://github.com/tjdoomer/Delta-code.git
cd Delta-code
npm ci && npm run build
npm install -g .
```

## Quick Start

```bash
# First run — add your provider
delta
> /model add lmstudio openai-compatible http://localhost:1234/v1

# Every run after — auto-connects to your saved provider
delta
```

Or use environment variables:

```bash
OPENAI_API_KEY="lm-studio" OPENAI_BASE_URL="http://localhost:1234/v1" delta
```

## Provider Registry

Save connections once, switch between them anytime. Credentials persist in `~/.delta/providers.json`.

```bash
# Add connections
/model add lmstudio openai-compatible http://localhost:1234/v1
/model add ollama openai-compatible http://localhost:11434/v1
/model add openai openai https://api.openai.com/v1 sk-your-key
/model add anthropic anthropic https://api.anthropic.com/v1 sk-ant-your-key

# Discover local models
/model refresh

# List everything
/model list

# Switch provider mid-conversation (history preserved)
/switch lmstudio
/switch anthropic
```

## Tools

Delta ships with 20+ tools the model can invoke:

| Tool | What it does |
|------|-------------|
| `read_file` | Read file contents with pagination |
| `write_file` | Create or overwrite files |
| `replace` | Precise text replacement with context matching |
| `multi_edit` | Atomic edits across multiple files |
| `diff_preview` | Preview an edit as a unified diff before applying |
| `glob` | Find files by pattern |
| `search_file_content` | Regex search across the codebase |
| `read_file_summary` | Structural skeleton — signatures only, ~95% fewer tokens |
| `repo_map` | Ranked codebase map with dependency graph and PageRank |
| `run_shell_command` | Execute shell commands |
| `lint` | Auto-detect and run project linter with structured output |
| `run_tests` | Auto-detect and run project tests |
| `think` | Structured reasoning before acting (no side effects) |
| `checkpoint_save` | Save workspace state before risky changes |
| `checkpoint_restore` | Revert to a saved checkpoint |
| `checkpoint_list` | List saved checkpoints |
| `save_memory` | Persist facts across sessions |
| `todo_write` | Track tasks within a session |
| `web_search` | Search the web (requires Tavily API key) |
| `web_fetch` | Fetch and parse URL content |
| `sub_agent` | Spawn autonomous sub-agents for complex tasks |

## Commands

| Command | What it does |
|---------|-------------|
| `/model list` | Show all available models across connections |
| `/model set <name>` | Change the active model |
| `/model add` | Save a new provider connection |
| `/model refresh` | Re-discover models from local servers |
| `/switch <id>` | Swap provider mid-conversation |
| `/doctor` | Provider health check — env vars, connectivity, model |
| `/persona set <id>` | Change writing style (see Personas below) |
| `/checkpoint save` | Save a workspace checkpoint |
| `/checkpoint restore` | Restore a checkpoint |
| `/chat save` | Save conversation |
| `/chat list` | List saved conversations |
| `/theme` | Change color theme |
| `/help` | Show all commands |

## Personas

Easter egg — change Delta's personality without affecting technical capability.

```bash
/persona list                # Show all personas
/persona set noir            # Hardboiled detective investigating bugs
/persona set salaryman       # Dedicated Japanese office worker
/persona set 1950s           # Mid-century company man
/persona set pirate          # Seafaring programmer
/persona set shakespeare     # The Bard writes your pull requests
/persona set drill-sergeant  # WILL NOT tolerate sloppy code
/persona set corporate       # Synergize the codebase
/persona set default         # Back to normal
```

Custom personas: drop a `.md` file in `~/.delta/personas/` — filename becomes the ID, content becomes the voice.

## Diagnostics

```bash
/doctor
```

Validates your setup: API keys (detects placeholders), local server reachability (LM Studio, Ollama), saved connection health, and active model configuration.

## Supported Providers

| Provider | Connection Type | Local |
|----------|----------------|-------|
| LM Studio | `openai-compatible` | Yes |
| Ollama | `openai-compatible` | Yes |
| OpenAI | `openai` | No |
| Anthropic Claude | `anthropic` | No |
| Google Gemini | `gemini` | No |
| Azure OpenAI | `openai-compatible` | No |
| AWS Bedrock | `openai-compatible` | No |
| Any OpenAI-compatible | `openai-compatible` | Depends |

## Architecture

Monorepo with npm workspaces:

- `packages/core` — content generators, tools, indexing, provider registry
- `packages/cli` — Ink/React terminal UI, slash commands, auth flow
- `packages/vscode-ide-companion` — VS Code extension

Key internals:
- **Provider adapters** convert between a canonical type system and each provider's API (OpenAI, Anthropic, Google)
- **Schema normalization** adapts tool declarations per-provider (strict mode for OpenAI, permissive for Gemini)
- **Repo indexing** uses regex-based symbol extraction, import dependency graph, and PageRank for codebase navigation
- **Think block passthrough** surfaces reasoning traces from models like DeepSeek-R1, QwQ, Qwen3 instead of stripping them

## Docs

- [Commands](./docs/cli/commands.md)
- [Authentication](./docs/cli/authentication.md)
- [Configuration](./docs/cli/configuration.md)
- [Tools](./docs/tools/index.md)
- [Architecture](./docs/architecture.md)
- [Troubleshooting](./docs/troubleshooting.md)

## License

Apache-2.0. See [LICENSE](./LICENSE).

Based on [Gemini CLI](https://github.com/google-gemini/gemini-cli) via [QwenLM/qwen-code](https://github.com/QwenLM/qwen-code).
