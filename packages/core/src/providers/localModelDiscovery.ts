/**
 * Auto-discovery for local model servers (LM Studio, Ollama).
 *
 * Both expose an OpenAI-compatible /v1/models endpoint, but their response
 * shapes differ slightly. This module normalizes both into DiscoveredModel[].
 */

export interface DiscoveredModel {
  id: string;
  name: string;
  /** Context window if reported by the server */
  contextWindow: number | null;
  /** Source server type */
  source: 'lmstudio' | 'ollama';
  /** Whether the model is currently loaded and ready */
  loaded: boolean;
}

/**
 * Discover models from an LM Studio instance.
 * LM Studio serves an OpenAI-compatible API at localhost:1234/v1/models.
 */
export async function discoverLMStudioModels(
  baseUrl: string = 'http://localhost:1234',
): Promise<DiscoveredModel[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${baseUrl}/v1/models`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return [];

    const data = await response.json() as {
      data?: Array<{
        id: string;
        object?: string;
        // LM Studio includes max_model_len or context_length in some versions
        max_model_len?: number;
        context_length?: number;
      }>;
    };

    if (!data.data || !Array.isArray(data.data)) return [];

    return data.data.map(model => ({
      id: model.id,
      name: model.id,
      contextWindow: model.max_model_len || model.context_length || null,
      source: 'lmstudio' as const,
      loaded: true, // If it shows up in /v1/models, it's loaded
    }));
  } catch {
    return [];
  }
}

/**
 * Discover models from an Ollama instance.
 * Ollama has its own API at localhost:11434/api/tags, plus an
 * OpenAI-compatible endpoint at /v1/models.
 *
 * We use /api/tags because it returns more metadata (size, parameter count).
 */
export async function discoverOllamaModels(
  baseUrl: string = 'http://localhost:11434',
): Promise<DiscoveredModel[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return [];

    const data = await response.json() as {
      models?: Array<{
        name: string;
        model: string;
        size?: number;
        details?: {
          parameter_size?: string;
          family?: string;
          // Context window isn't in the tags response — would need /api/show
        };
      }>;
    };

    if (!data.models || !Array.isArray(data.models)) return [];

    return data.models.map(model => ({
      id: model.name,
      name: model.name,
      contextWindow: null, // Not available from /api/tags — needs separate /api/show call
      source: 'ollama' as const,
      loaded: true,
    }));
  } catch {
    return [];
  }
}

/**
 * Probe whether a server is reachable and identify its type.
 * Returns the server type or null if unreachable.
 */
export async function probeEndpoint(
  baseUrl: string,
): Promise<{ type: 'lmstudio' | 'ollama' | 'openai-compatible'; modelCount: number } | null> {
  // Try Ollama-specific endpoint first
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json() as { models?: unknown[] };
      return { type: 'ollama', modelCount: data.models?.length ?? 0 };
    }
  } catch { /* not Ollama */ }

  // Try OpenAI-compatible /v1/models (covers LM Studio and others)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    // Normalize: if baseUrl ends with /v1, use it; otherwise append /v1
    const modelsUrl = baseUrl.endsWith('/v1')
      ? `${baseUrl}/models`
      : `${baseUrl}/v1/models`;

    const response = await fetch(modelsUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json() as { data?: unknown[] };
      const count = data.data?.length ?? 0;

      // Heuristic: LM Studio runs on port 1234 by default
      const isLMStudio = baseUrl.includes(':1234');
      return {
        type: isLMStudio ? 'lmstudio' : 'openai-compatible',
        modelCount: count,
      };
    }
  } catch { /* unreachable */ }

  return null;
}

/**
 * Discover models from any supported local endpoint.
 * Auto-detects the server type and uses the appropriate discovery method.
 */
export async function discoverModels(baseUrl: string): Promise<DiscoveredModel[]> {
  const probe = await probeEndpoint(baseUrl);
  if (!probe) return [];

  switch (probe.type) {
    case 'ollama':
      return discoverOllamaModels(baseUrl);
    case 'lmstudio':
      return discoverLMStudioModels(baseUrl);
    case 'openai-compatible':
      // For generic OpenAI-compatible servers, use the LM Studio discovery
      // (same /v1/models format)
      return discoverLMStudioModels(baseUrl);
  }
}
