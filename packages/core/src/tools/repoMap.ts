/**
 * Repo map tool — gives the model a ranked "table of contents" of the
 * codebase showing the most relevant files and symbols for a given query.
 *
 * Uses regex-based symbol extraction, an import dependency graph with
 * PageRank scoring, and TF-IDF relevance matching. Zero new dependencies.
 *
 * This is the tool that makes Aider effective with weaker models — it
 * pre-digests the codebase so the model doesn't have to hold everything
 * in context or grep speculatively.
 */

import {
  FunctionDeclaration,
} from '../types/delta.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolResult,
} from './tools.js';

import { RepoIndex } from '../indexing/repoIndex.js';
import { RegexSymbolExtractor } from '../indexing/symbolExtractor.js';
import { Config } from '../config/config.js';

interface RepoMapParams {
  query: string;
  max_tokens?: number;
}

const repoMapSchemaData: FunctionDeclaration = {
  name: 'repo_map',
  description:
    'Get a ranked map of the most relevant files and symbols in the codebase for a given query. Returns function/class signatures without bodies. Use this before diving into unfamiliar code to understand what exists and where.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'What you are looking for or trying to understand.',
      },
      max_tokens: {
        type: 'number',
        description: 'Maximum tokens for the output (default 2000).',
      },
    },
    required: ['query'],
    $schema: 'http://json-schema.org/draft-07/schema#',
  },
};

// Singleton index per session — lazy-built on first query, cached after
let _sharedIndex: RepoIndex | null = null;

function getSharedIndex(): RepoIndex {
  if (!_sharedIndex) {
    _sharedIndex = new RepoIndex(process.cwd(), new RegexSymbolExtractor());
  }
  return _sharedIndex;
}

class RepoMapInvocation extends BaseToolInvocation<RepoMapParams, ToolResult> {
  getDescription(): string {
    const preview = this.params.query.substring(0, 60);
    return preview.length < this.params.query.length ? `${preview}...` : preview;
  }

  async execute(): Promise<ToolResult> {
    const index = getSharedIndex();
    const maxTokens = this.params.max_tokens ?? 2000;

    try {
      const result = await index.query(this.params.query, maxTokens);

      return {
        llmContent: [{ text: result }],
        returnDisplay: result,
      };
    } catch (err) {
      const msg = `Error building repo map: ${err instanceof Error ? err.message : String(err)}`;
      return {
        llmContent: [{ text: msg }],
        returnDisplay: msg,
        error: { message: msg },
      };
    }
  }
}

export class RepoMapTool extends BaseDeclarativeTool<RepoMapParams, ToolResult> {
  static readonly Name: string = repoMapSchemaData.name!;

  constructor(_config: Config) {
    super(
      RepoMapTool.Name,
      'Repo Map',
      repoMapSchemaData.description!,
      Kind.Read,
      repoMapSchemaData.parametersJsonSchema,
    );
  }

  protected createInvocation(params: RepoMapParams) {
    return new RepoMapInvocation(params);
  }
}
