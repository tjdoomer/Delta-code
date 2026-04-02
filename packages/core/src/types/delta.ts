/**
 * Delta type barrel — the single point of decoupling from @google/genai.
 *
 * All files in the codebase import from here instead of directly from the
 * @google/genai SDK. This means:
 * 1. Only this file depends on @google/genai types
 * 2. When we replace the underlying types with native Delta definitions,
 *    only this file changes — everything else keeps working
 * 3. Provider-specific files (content generators, adapters) still import
 *    directly from the SDK for types that are truly provider-specific
 *
 * Import convention:
 *   import { Content, Part, FunctionDeclaration } from '../types/delta.js';
 *   // NOT from '@google/genai'
 */

// ---------------------------------------------------------------------------
// Re-exports — same names, new path. Migration is just import path changes.
// ---------------------------------------------------------------------------

// Message types
export {
  Content,
  Part,
  type PartListUnion,
  type PartUnion,
} from '@google/genai';

// Request/Response types
export {
  GenerateContentResponse,
  GenerateContentParameters,
  GenerateContentConfig,
  type GenerateContentResponseUsageMetadata,
} from '@google/genai';

// Token counting
export {
  type CountTokensResponse,
  type CountTokensParameters,
} from '@google/genai';

// Embedding
export {
  type EmbedContentResponse,
  type EmbedContentParameters,
} from '@google/genai';

// Tool/Function types
export {
  FunctionDeclaration,
  FunctionCall,
  type FunctionResponse,
  type Tool,
  type CallableTool,
  type ToolListUnion,
} from '@google/genai';

// Schema types
export {
  type Schema,
  type SchemaUnion,
  Type,
} from '@google/genai';

// Enums
export {
  FinishReason,
} from '@google/genai';

// ---------------------------------------------------------------------------
// Native Delta types — for features not in @google/genai
// ---------------------------------------------------------------------------

/** Provider-agnostic model capability descriptor. */
export interface DeltaModelCapabilities {
  toolCalling: boolean | null;
  vision: boolean | null;
  streaming: boolean | null;
  contextWindow: number | null;
  thinkBlocks: boolean | null;
}

/** Provider identification for schema normalization, diagnostics, etc. */
export type DeltaProviderType =
  | 'google'
  | 'openai'
  | 'anthropic'
  | 'bedrock'
  | 'vertex-ai'
  | 'openai-compatible'
  | 'ollama'
  | 'lmstudio';
