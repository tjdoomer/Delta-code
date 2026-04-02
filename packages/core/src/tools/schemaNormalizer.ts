/**
 * Per-provider tool schema normalization.
 *
 * Different providers have conflicting requirements for tool parameter schemas:
 * - OpenAI strict mode: every object needs additionalProperties: false, all
 *   properties in required[]
 * - Gemini: rejects required[] entries for properties not in properties{}
 * - Anthropic: generally permissive but ignores unknown schema fields
 * - Local models (LM Studio/Ollama via OpenAI-compatible API): vary wildly
 *
 * This module provides a recursive schema walker that adapts tool declarations
 * to each provider's requirements, preventing silent parameter stripping or
 * outright API rejections.
 */

export type ProviderType =
  | 'openai'
  | 'openai-strict'
  | 'gemini'
  | 'anthropic'
  | 'ollama'
  | 'lmstudio';

/**
 * Normalize a JSON Schema object for a specific provider.
 * Operates on a deep copy — never mutates the input.
 */
export function normalizeSchemaForProvider(
  schema: Record<string, unknown>,
  provider: ProviderType,
): Record<string, unknown> {
  // Deep copy to avoid mutating the original schema shared across providers
  const copy = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
  return walkSchema(copy, provider);
}

/**
 * Recursively walk and normalize a schema node.
 *
 * The walker handles:
 * - Object schemas (properties, additionalProperties, required)
 * - Array schemas (items)
 * - Combinators (anyOf, oneOf, allOf)
 * - Nested schemas at arbitrary depth
 */
function walkSchema(
  node: Record<string, unknown>,
  provider: ProviderType,
): Record<string, unknown> {
  if (!node || typeof node !== 'object') return node;

  const type = node.type as string | undefined;

  // Handle object schemas — the main divergence point between providers
  if (type === 'object' && node.properties) {
    normalizeObjectSchema(node, provider);
  }

  // Recurse into properties
  if (node.properties && typeof node.properties === 'object') {
    const props = node.properties as Record<string, Record<string, unknown>>;
    for (const key of Object.keys(props)) {
      if (props[key] && typeof props[key] === 'object') {
        props[key] = walkSchema(props[key], provider);
      }
    }
  }

  // Recurse into array items
  if (node.items && typeof node.items === 'object') {
    if (Array.isArray(node.items)) {
      // Tuple validation — array of schemas
      node.items = node.items.map(item =>
        typeof item === 'object' && item !== null
          ? walkSchema(item as Record<string, unknown>, provider)
          : item,
      );
    } else {
      node.items = walkSchema(
        node.items as Record<string, unknown>,
        provider,
      );
    }
  }

  // Recurse into combinators (anyOf, oneOf, allOf)
  for (const combinator of ['anyOf', 'oneOf', 'allOf'] as const) {
    if (Array.isArray(node[combinator])) {
      node[combinator] = (node[combinator] as Record<string, unknown>[]).map(
        branch =>
          typeof branch === 'object' && branch !== null
            ? walkSchema(branch, provider)
            : branch,
      );
    }
  }

  // Recurse into additionalProperties if it's a schema (not just true/false)
  if (
    node.additionalProperties &&
    typeof node.additionalProperties === 'object'
  ) {
    node.additionalProperties = walkSchema(
      node.additionalProperties as Record<string, unknown>,
      provider,
    );
  }

  return node;
}

/**
 * Apply provider-specific rules to an object schema node.
 */
function normalizeObjectSchema(
  node: Record<string, unknown>,
  provider: ProviderType,
): void {
  const props = node.properties as Record<string, unknown>;
  const propertyNames = Object.keys(props);

  switch (provider) {
    case 'openai-strict':
    case 'lmstudio': {
      // OpenAI strict mode requires:
      // 1. additionalProperties: false on every object
      // 2. Every property in required[] (even optional ones — OpenAI's
      //    strict mode rejects schemas where required doesn't list all props)
      node.additionalProperties = false;
      node.required = propertyNames;

      // Drop empty object schemas that would cause silent stripping.
      // An empty properties {} with required [] is valid but useless.
      if (propertyNames.length === 0) {
        delete node.required;
      }
      break;
    }

    case 'openai': {
      // Standard OpenAI (non-strict): add additionalProperties: false
      // but don't force all properties into required — respect the
      // schema's original required list
      if (node.additionalProperties === undefined) {
        node.additionalProperties = false;
      }
      break;
    }

    case 'gemini': {
      // Gemini rejects required[] entries for properties not in properties{}.
      // Strip any required entries that don't have a matching property.
      if (Array.isArray(node.required)) {
        node.required = (node.required as string[]).filter(
          name => name in props,
        );
        if ((node.required as string[]).length === 0) {
          delete node.required;
        }
      }
      // Gemini also doesn't support additionalProperties — remove it
      delete node.additionalProperties;
      break;
    }

    case 'anthropic': {
      // Anthropic is permissive — just clean up obviously wrong stuff.
      // Strip required entries that reference non-existent properties.
      if (Array.isArray(node.required)) {
        node.required = (node.required as string[]).filter(
          name => name in props,
        );
        if ((node.required as string[]).length === 0) {
          delete node.required;
        }
      }
      break;
    }

    case 'ollama': {
      // Ollama uses OpenAI-compatible API but some model backends crash
      // on additionalProperties. Add it but also drop empty object schemas
      // entirely — some Ollama backends silently strip parameters from
      // schemas with no properties defined.
      if (propertyNames.length === 0) {
        // Empty object schema — delete properties and required to avoid
        // confusing backends that don't handle empty schemas well
        delete node.properties;
        delete node.required;
        delete node.additionalProperties;
      } else {
        node.additionalProperties = false;
        // Keep existing required list, don't force all
        if (Array.isArray(node.required)) {
          node.required = (node.required as string[]).filter(
            name => name in props,
          );
        }
      }
      break;
    }
  }
}
