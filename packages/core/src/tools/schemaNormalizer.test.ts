import { describe, it, expect } from 'vitest';
import { normalizeSchemaForProvider } from './schemaNormalizer.js';

const baseSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'File path' },
    content: { type: 'string', description: 'File content' },
    overwrite: { type: 'boolean', description: 'Overwrite existing' },
  },
  required: ['path', 'content'],
};

describe('schemaNormalizer', () => {
  describe('openai-strict', () => {
    it('should add additionalProperties: false and require all properties', () => {
      const result = normalizeSchemaForProvider(baseSchema, 'openai-strict');
      expect(result.additionalProperties).toBe(false);
      expect(result.required).toEqual(['path', 'content', 'overwrite']);
    });

    it('should handle empty properties object', () => {
      const schema = { type: 'object', properties: {} };
      const result = normalizeSchemaForProvider(schema, 'openai-strict');
      expect(result.additionalProperties).toBe(false);
      expect(result.required).toBeUndefined();
    });

    it('should recursively normalize nested objects', () => {
      const schema = {
        type: 'object',
        properties: {
          config: {
            type: 'object',
            properties: {
              timeout: { type: 'number' },
              retries: { type: 'number' },
            },
          },
        },
      };
      const result = normalizeSchemaForProvider(schema, 'openai-strict');
      const config = (result.properties as Record<string, Record<string, unknown>>).config;
      expect(config.additionalProperties).toBe(false);
      expect(config.required).toEqual(['timeout', 'retries']);
    });
  });

  describe('gemini', () => {
    it('should strip required entries without matching properties', () => {
      const schema = {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path', 'nonexistent'],
      };
      const result = normalizeSchemaForProvider(schema, 'gemini');
      expect(result.required).toEqual(['path']);
    });

    it('should remove additionalProperties entirely', () => {
      const schema = {
        type: 'object',
        properties: { path: { type: 'string' } },
        additionalProperties: false,
      };
      const result = normalizeSchemaForProvider(schema, 'gemini');
      expect(result.additionalProperties).toBeUndefined();
    });

    it('should delete required if all entries are invalid', () => {
      const schema = {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['nonexistent1', 'nonexistent2'],
      };
      const result = normalizeSchemaForProvider(schema, 'gemini');
      expect(result.required).toBeUndefined();
    });
  });

  describe('anthropic', () => {
    it('should pass through valid schemas mostly unchanged', () => {
      const result = normalizeSchemaForProvider(baseSchema, 'anthropic');
      expect(result.required).toEqual(['path', 'content']);
      // Anthropic doesn't force additionalProperties
      expect(result.additionalProperties).toBeUndefined();
    });

    it('should strip invalid required entries', () => {
      const schema = {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path', 'ghost'],
      };
      const result = normalizeSchemaForProvider(schema, 'anthropic');
      expect(result.required).toEqual(['path']);
    });
  });

  describe('ollama', () => {
    it('should add additionalProperties: false for non-empty schemas', () => {
      const result = normalizeSchemaForProvider(baseSchema, 'ollama');
      expect(result.additionalProperties).toBe(false);
    });

    it('should strip empty object schemas entirely', () => {
      const schema = { type: 'object', properties: {}, required: [] };
      const result = normalizeSchemaForProvider(schema, 'ollama');
      expect(result.properties).toBeUndefined();
      expect(result.required).toBeUndefined();
      expect(result.additionalProperties).toBeUndefined();
    });
  });

  describe('openai (non-strict)', () => {
    it('should add additionalProperties: false if not set', () => {
      const result = normalizeSchemaForProvider(baseSchema, 'openai');
      expect(result.additionalProperties).toBe(false);
    });

    it('should preserve existing additionalProperties value', () => {
      const schema = { ...baseSchema, additionalProperties: true };
      const result = normalizeSchemaForProvider(schema, 'openai');
      expect(result.additionalProperties).toBe(true);
    });

    it('should not force all properties into required', () => {
      const result = normalizeSchemaForProvider(baseSchema, 'openai');
      expect(result.required).toEqual(['path', 'content']);
    });
  });

  describe('combinators', () => {
    it('should recursively normalize anyOf branches', () => {
      const schema = {
        type: 'object',
        properties: {
          value: {
            anyOf: [
              { type: 'string' },
              {
                type: 'object',
                properties: { nested: { type: 'number' } },
              },
            ],
          },
        },
      };
      const result = normalizeSchemaForProvider(schema, 'openai-strict');
      const value = (result.properties as Record<string, Record<string, unknown>>).value;
      const branches = value.anyOf as Record<string, unknown>[];
      const objectBranch = branches.find(b => b.type === 'object')!;
      expect(objectBranch.additionalProperties).toBe(false);
      expect(objectBranch.required).toEqual(['nested']);
    });

    it('should recursively normalize oneOf branches', () => {
      const schema = {
        type: 'object',
        properties: {
          value: {
            oneOf: [
              {
                type: 'object',
                properties: { a: { type: 'string' } },
              },
            ],
          },
        },
      };
      const result = normalizeSchemaForProvider(schema, 'openai-strict');
      const value = (result.properties as Record<string, Record<string, unknown>>).value;
      const branch = (value.oneOf as Record<string, unknown>[])[0];
      expect(branch.additionalProperties).toBe(false);
    });
  });

  describe('array items', () => {
    it('should normalize object schemas inside array items', () => {
      const schema = {
        type: 'object',
        properties: {
          edits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                file: { type: 'string' },
                content: { type: 'string' },
              },
            },
          },
        },
      };
      const result = normalizeSchemaForProvider(schema, 'openai-strict');
      const edits = (result.properties as Record<string, Record<string, unknown>>).edits;
      const items = edits.items as Record<string, unknown>;
      expect(items.additionalProperties).toBe(false);
      expect(items.required).toEqual(['file', 'content']);
    });
  });

  describe('immutability', () => {
    it('should not mutate the original schema', () => {
      const original = JSON.parse(JSON.stringify(baseSchema));
      normalizeSchemaForProvider(baseSchema, 'openai-strict');
      expect(baseSchema).toEqual(original);
    });
  });
});
