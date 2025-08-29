## Dependencies Overview

This project is a TypeScript monorepo. Key dependency groups and why they exist:

- Build & bundling
  - esbuild: builds distributable JS from TS quickly
  - tsx: node runner for TS-based scripts in dev

- Linting & formatting
  - eslint, @typescript-eslint/*, eslint-plugin-import: code quality
  - prettier + eslint-config-prettier: formatting

- Testing
  - vitest: test runner with V8 coverage
  - msw, memfs, mock-fs: mocks for filesystem and network

- CLI & UI
  - ink: React-like terminal UI
  - react-devtools-core: devtools support

- Workspace tooling
  - yargs: argument parsing
  - glob: file discovery

### Installing dependencies

```bash
npm ci
```

Use `npm ci` (not `npm install`) to ensure exact versions from `package-lock.json` for reproducible builds.

### After installing

- `npm run lint:ci` — no warnings in CI
- `npm run build` — compile packages
- `npm run test:ci` — run tests across workspaces

### Model providers

Delta supports external model APIs (e.g., OpenAI, Anthropic/Claude) or local runtimes (LM Studio, Ollama). Configure via environment variables or settings where applicable. No hard dependency on a single provider is required.


