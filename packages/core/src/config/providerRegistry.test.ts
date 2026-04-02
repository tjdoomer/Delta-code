import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderRegistry } from './providerRegistry.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { homedir } from 'node:os';

vi.mock('node:fs/promises');

const PROVIDERS_FILE = path.join(homedir(), '.delta', 'providers.json');

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ProviderRegistry();
  });

  describe('load', () => {
    it('should return empty config when file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      const config = await registry.load();
      expect(config.connections).toEqual([]);
    });

    it('should parse existing providers file', async () => {
      const data = {
        connections: [
          { id: 'test', type: 'openai', name: 'Test', autoDiscover: false },
        ],
        defaultConnection: 'test',
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(data));
      const config = await registry.load();
      expect(config.connections).toHaveLength(1);
      expect(config.connections[0].id).toBe('test');
    });
  });

  describe('addConnection', () => {
    it('should add a new connection and save', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await registry.addConnection({
        id: 'lmstudio',
        type: 'openai-compatible',
        name: 'LM Studio',
        baseUrl: 'http://localhost:1234/v1',
        autoDiscover: true,
      });

      expect(fs.writeFile).toHaveBeenCalledWith(
        PROVIDERS_FILE,
        expect.stringContaining('"lmstudio"'),
        'utf-8',
      );
    });

    it('should set first connection as default', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await registry.addConnection({
        id: 'first',
        type: 'openai',
        name: 'First',
        autoDiscover: false,
      });

      const defaults = await registry.getDefault();
      expect(defaults.connection).toBe('first');
    });

    it('should replace existing connection with same ID', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await registry.addConnection({
        id: 'test',
        type: 'openai',
        name: 'Original',
        autoDiscover: false,
      });

      await registry.addConnection({
        id: 'test',
        type: 'openai',
        name: 'Updated',
        autoDiscover: false,
      });

      const connections = await registry.getConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0].name).toBe('Updated');
    });
  });

  describe('removeConnection', () => {
    it('should remove a connection and return true', async () => {
      const data = {
        connections: [
          { id: 'a', type: 'openai', name: 'A', autoDiscover: false },
          { id: 'b', type: 'openai', name: 'B', autoDiscover: false },
        ],
        defaultConnection: 'a',
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(data));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const removed = await registry.removeConnection('a');
      expect(removed).toBe(true);

      const connections = await registry.getConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0].id).toBe('b');
    });

    it('should return false for non-existent connection', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const removed = await registry.removeConnection('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('capabilities', () => {
    it('should store and retrieve model capabilities', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await registry.setModelCapability('qwen2.5-coder-32b', {
        connection: 'lmstudio',
        capabilities: {
          toolCalling: true,
          vision: false,
          streaming: true,
          contextWindow: 32768,
          thinkBlocks: false,
        },
        lastProbed: '2026-04-02T10:00:00Z',
      });

      const cap = await registry.getModelCapability('qwen2.5-coder-32b');
      expect(cap).toBeDefined();
      expect(cap!.capabilities.toolCalling).toBe(true);
      expect(cap!.capabilities.contextWindow).toBe(32768);
    });
  });
});
