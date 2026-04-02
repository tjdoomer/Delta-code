# File Summary Tool

## Branch: `feature/file-summary`

## Problem

`read_file` returns full source code. A 2000-line file uses ~4000 tokens of
context. A 32B model running locally with 32k context can only hold ~8 full
files before context is exhausted. Most of the time, the model only needs to
understand a file's interface — not read every line.

## What it is

A tool that returns only the structural skeleton of a file: exports, class
declarations, method signatures, type definitions, and docstrings. No function
bodies. A 2000-line file becomes a ~50-line summary.

## Example

```
read_file_summary({ path: "packages/core/src/core/openaiContentGenerator.ts" })

→ // OpenAI provider — wraps the openai SDK for Delta's ContentGenerator interface
  // Dependencies: @google/genai types, openai SDK, Config, telemetry loggers

  class OpenAIContentGenerator implements ContentGenerator {
    constructor(config: ContentGeneratorConfig, gcConfig: Config)

    // Core interface
    generateContent(request: GenerateContentParameters, userPromptId: string): Promise<GenerateContentResponse>
    generateContentStream(request: GenerateContentParameters, userPromptId: string): Promise<AsyncGenerator<...>>
    countTokens(request: CountTokensParameters): Promise<CountTokensResponse>
    embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>

    // Internal — streaming
    private streamGenerator(stream: AsyncIterable<ChatCompletionChunk>): AsyncGenerator<...>
    private filterThinkTags(text: string): string
    private convertStreamChunkToGenAIFormat(chunk: ChatCompletionChunk): GenerateContentResponse

    // Internal — format conversion
    private convertToOpenAIFormat(request: GenerateContentParameters): {...}
    private convertToGenAIFormat(response: OpenAIResponseFormat): GenerateContentResponse
  }

  // Types
  interface ChatCompletionContentPartTextWithCache extends ChatCompletionContentPartText { ... }
  interface OpenAIToolCall { id, type, function: { name, arguments } }
  interface OpenAIMessage { role, content, tool_calls?, tool_call_id? }
  interface OpenAIUsage { prompt_tokens, completion_tokens, total_tokens }
```

1763 lines → 30 lines. ~95% token reduction.

## Implementation

### With tree-sitter (preferred, shares infra with repo-map)

If `feature/repo-map` (branch 8) is merged, reuse its AST extraction layer.
Call `astExtractor.extractSymbols(filePath)` and format as a summary.

### Without tree-sitter (standalone fallback)

Regex-based extraction for the top languages:

- **TypeScript/JavaScript**: Match `export`, `class`, `interface`, `type`,
  `function`, `const ... = (` patterns. Extract JSDoc comments.
- **Python**: Match `class`, `def`, decorators. Extract docstrings.
- **Go**: Match `func`, `type`, `struct`, `interface`.
- **Rust**: Match `pub fn`, `struct`, `enum`, `trait`, `impl`.

Less accurate than tree-sitter but zero dependencies.

## Tool declaration

```typescript
{
  name: 'read_file_summary',
  description: 'Get a structural summary of a file: exports, class '
    + 'declarations, method signatures, and type definitions. No function '
    + 'bodies. Use this instead of read_file when you need to understand '
    + 'a file\'s interface without reading all the code. ~95% fewer tokens '
    + 'than reading the full file.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the file.',
      },
      include_docstrings: {
        type: 'boolean',
        description: 'Include docstrings/JSDoc comments (default true).',
      },
      include_private: {
        type: 'boolean',
        description: 'Include private/internal members (default false).',
      },
    },
    required: ['path'],
  },
}
```

## Files to create
- `packages/core/src/tools/fileSummary.ts` — tool implementation
- `packages/core/src/tools/fileSummary.test.ts`
- `packages/core/src/indexing/signatureExtractor.ts` — regex fallback
  (or reuse `astExtractor.ts` from repo-map branch)

## Files to modify
- `packages/core/src/config/config.ts` — register tool

## Dependencies
- Shares tree-sitter infrastructure with `feature/repo-map` (branch 8)
  but can work standalone with regex fallback

## Effort: 2-3 days (with tree-sitter), 1 day (regex-only fallback)
