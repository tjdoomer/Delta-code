# Diff Preview Tool

## Branch: `feature/diff-preview`

## Problem

The edit tool applies changes immediately. If the model makes a mistake, it has
to undo (currently manual via `/checkpoint restore`). There's no way for the
model to preview what a change would look like before committing to it.

## What it is

A dry-run edit tool that returns a unified diff without modifying any files.
The model can self-review the diff and decide whether to proceed.

## Tool declaration

```typescript
{
  name: 'diff_preview',
  description: 'Preview what an edit would look like as a unified diff '
    + 'WITHOUT applying it. Use this to verify your changes before '
    + 'committing them with the edit tool. Returns a unified diff with '
    + 'context lines.',
  parameters: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Absolute path to the file.',
      },
      old_string: {
        type: 'string',
        description: 'The exact text to be replaced.',
      },
      new_string: {
        type: 'string',
        description: 'The replacement text.',
      },
      context_lines: {
        type: 'number',
        description: 'Number of context lines around changes (default 3).',
      },
    },
    required: ['file_path', 'old_string', 'new_string'],
  },
}
```

## Output

```diff
--- a/packages/core/src/core/anthropicContentGenerator.ts
+++ b/packages/core/src/core/anthropicContentGenerator.ts
@@ -286,4 +286,8 @@
   async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
-    // Anthropic doesn't have a dedicated token counting endpoint
-    // Rough approximation: 1 token ≈ 4 characters
-    const content = JSON.stringify(request.contents);
-    const totalTokens = Math.ceil(content.length / 4);
+    const encoder = encoding_for_model('cl100k_base');
+    const content = JSON.stringify(request.contents);
+    const totalTokens = encoder.encode(content).length;
+    encoder.free();

     return { totalTokens };
```

## Implementation

Reuse the existing `diff` package (already in dependencies) to generate
unified diffs. The tool:

1. Read the file
2. Find `old_string` (same validation as edit tool)
3. Compute the replacement in memory (don't write)
4. Generate unified diff with `createPatch()` from the `diff` package
5. Return the diff string

~30 lines of implementation code.

## Files to create
- `packages/core/src/tools/diffPreview.ts`
- `packages/core/src/tools/diffPreview.test.ts`

## Files to modify
- `packages/core/src/config/config.ts` — register tool

## Effort: ~2 hours
