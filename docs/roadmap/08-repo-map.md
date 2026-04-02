# Repo Map Tool

## Branch: `feature/repo-map`

## Problem

Without a codebase overview, the model has to grep/glob/read speculatively —
burning tokens and turns trying to find relevant code. A 32B local model with
32k context can't afford to read 10 files to find the right one.

## What it is

A tree-sitter-powered codebase index that gives the model a compact "table of
contents" showing the most relevant symbols for the current task.

This is what makes Aider effective with smaller models. Their implementation
uses tree-sitter for AST parsing + PageRank for relevance ranking.

## Example output

```
repo_map({ query: "authentication middleware" })

→ Repo Map (ranked by relevance to: "authentication middleware")

  packages/core/src/core/auth.ts
    ├─ class AuthManager
    │   ├─ authenticate(token: string): Promise<User>
    │   ├─ validateSession(sessionId: string): boolean
    │   └─ refreshToken(user: User): string
    ├─ interface AuthConfig { ... }
    └─ function createAuthMiddleware(config: AuthConfig): Middleware

  packages/cli/src/ui/components/AuthDialog.tsx
    ├─ function AuthDialog(props: AuthDialogProps): JSX.Element
    └─ const AUTH_PROVIDERS: AuthProvider[]

  packages/core/src/core/contentGenerator.ts
    ├─ enum AuthType { LOGIN_WITH_GOOGLE, USE_GEMINI, ... }
    └─ function createContentGenerator(config, authType): ContentGenerator

  (3 more files with lower relevance scores omitted)
```

## Architecture

### Phase 1: Tree-sitter AST extraction

- Use `web-tree-sitter` (WASM, works everywhere) or `tree-sitter` native bindings
- Language grammars needed: TypeScript, JavaScript, Python, Go, Rust, Java, C/C++,
  Ruby, PHP, Swift, Kotlin — ship the top 10, lazy-load others
- Extract from each file:
  - Module-level exports
  - Class declarations + method signatures
  - Function declarations + parameter types
  - Interface/type declarations
  - Import statements (for dependency graph)

### Phase 2: Dependency graph + PageRank

- Build a directed graph: file A imports from file B → edge A→B
- Run PageRank to score each file's "importance" in the codebase
- Weight scores toward files relevant to the current query using
  TF-IDF on symbol names

### Phase 3: Context-aware truncation

- Given a token budget (configurable, default ~2000 tokens), select the
  top-ranked files and include as many signatures as fit
- Prioritize: files matching query > high PageRank > recently modified
- For each file, show: exported symbols with signatures, omit function bodies

### Phase 4: Caching

- Cache the AST + graph per file, keyed on file content hash
- Invalidate on file modification (watch via `fs.watch` or check at query time)
- Full reindex only when >20% of files have changed

## Tool declaration

```typescript
{
  name: 'repo_map',
  description: 'Get a ranked map of the most relevant files and symbols '
    + 'in the codebase for a given query. Returns function/class signatures '
    + 'without bodies. Use this before diving into unfamiliar code.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'What you are looking for or trying to understand.',
      },
      max_tokens: {
        type: 'number',
        description: 'Max tokens for the output (default 2000).',
      },
    },
    required: ['query'],
  },
}
```

## Dependencies

```json
{
  "web-tree-sitter": "^0.24.0",
  "tree-sitter-typescript": "^0.23.0",
  "tree-sitter-javascript": "^0.23.0",
  "tree-sitter-python": "^0.23.0"
}
```

Additional grammars added as optional/lazy-loaded.

## Files to create
- `packages/core/src/tools/repoMap.ts` — tool entry point
- `packages/core/src/tools/repoMap.test.ts`
- `packages/core/src/indexing/astExtractor.ts` — tree-sitter parsing
- `packages/core/src/indexing/dependencyGraph.ts` — import graph + PageRank
- `packages/core/src/indexing/repoIndex.ts` — cache layer, incremental updates
- `packages/core/src/indexing/symbolRanker.ts` — TF-IDF + PageRank scoring

## Files to modify
- `packages/core/package.json` — add tree-sitter dependencies
- `packages/core/src/config/config.ts` — register repo_map tool

## Effort: 1-2 weeks — the biggest feature but the biggest differentiator
