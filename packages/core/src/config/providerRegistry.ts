/**
 * Persistent provider registry — stores connection configs in ~/.delta/providers.json
 * so users configure credentials once and switch between providers at runtime.
 *
 * Each connection represents a way to reach an LLM (API key + endpoint).
 * Multiple connections can use the same provider type (e.g. two OpenAI-compatible
 * endpoints: one cloud, one local).
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { homedir } from 'node:os';

// Lazy-evaluated paths — avoids calling homedir() at module load time,
// which breaks when test suites mock os.homedir() after import.
function getDeltaDir(): string {
  return path.join(homedir(), '.delta');
}
function getProvidersFile(): string {
  return path.join(getDeltaDir(), 'providers.json');
}
function getCapabilitiesFile(): string {
  return path.join(getDeltaDir(), 'model-capabilities.json');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionType =
  | 'openai'
  | 'openai-compatible'
  | 'anthropic'
  | 'gemini'
  | 'bedrock'
  | 'vertex-ai';

export interface ProviderConnection {
  id: string;
  type: ConnectionType;
  name: string;
  baseUrl?: string;
  apiKey?: string;
  /** If true, query the endpoint for available models on refresh */
  autoDiscover: boolean;
  /** Region for Bedrock */
  region?: string;
}

export interface ProvidersConfig {
  connections: ProviderConnection[];
  defaultConnection?: string;
  defaultModel?: string;
}

export interface ModelCapability {
  connection: string;
  capabilities: {
    toolCalling: boolean | null;
    vision: boolean | null;
    streaming: boolean | null;
    contextWindow: number | null;
    thinkBlocks: boolean | null;
  };
  lastProbed: string;
}

export type CapabilitiesStore = Record<string, ModelCapability>;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class ProviderRegistry {
  private config: ProvidersConfig | null = null;
  private capabilities: CapabilitiesStore | null = null;

  /**
   * Load the registry from disk. Creates the file with empty defaults if absent.
   */
  async load(): Promise<ProvidersConfig> {
    if (this.config) return this.config;

    try {
      const raw = await fs.readFile(getProvidersFile(), 'utf-8');
      this.config = JSON.parse(raw) as ProvidersConfig;
    } catch {
      // File doesn't exist or is corrupt — start fresh
      this.config = { connections: [] };
    }

    return this.config;
  }

  /** Persist current state to disk. */
  async save(): Promise<void> {
    if (!this.config) return;
    await fs.mkdir(getDeltaDir(), { recursive: true });
    await fs.writeFile(getProvidersFile(), JSON.stringify(this.config, null, 2), 'utf-8');
  }

  // -- Connection CRUD --

  async getConnections(): Promise<ProviderConnection[]> {
    const cfg = await this.load();
    return cfg.connections;
  }

  async getConnection(id: string): Promise<ProviderConnection | undefined> {
    const cfg = await this.load();
    return cfg.connections.find(c => c.id === id);
  }

  async addConnection(conn: ProviderConnection): Promise<void> {
    const cfg = await this.load();

    // Replace existing with same ID
    const idx = cfg.connections.findIndex(c => c.id === conn.id);
    if (idx >= 0) {
      cfg.connections[idx] = conn;
    } else {
      cfg.connections.push(conn);
    }

    // First connection becomes default
    if (!cfg.defaultConnection) {
      cfg.defaultConnection = conn.id;
    }

    await this.save();
  }

  async removeConnection(id: string): Promise<boolean> {
    const cfg = await this.load();
    const before = cfg.connections.length;
    cfg.connections = cfg.connections.filter(c => c.id !== id);

    if (cfg.defaultConnection === id) {
      cfg.defaultConnection = cfg.connections[0]?.id;
    }

    await this.save();
    return cfg.connections.length < before;
  }

  async getDefault(): Promise<{ connection?: string; model?: string }> {
    const cfg = await this.load();
    return {
      connection: cfg.defaultConnection,
      model: cfg.defaultModel,
    };
  }

  async setDefault(connectionId: string, model?: string): Promise<void> {
    const cfg = await this.load();
    cfg.defaultConnection = connectionId;
    if (model) cfg.defaultModel = model;
    await this.save();
  }

  // -- Capabilities --

  async loadCapabilities(): Promise<CapabilitiesStore> {
    if (this.capabilities) return this.capabilities;

    try {
      const raw = await fs.readFile(getCapabilitiesFile(), 'utf-8');
      this.capabilities = JSON.parse(raw) as CapabilitiesStore;
    } catch {
      this.capabilities = {};
    }

    return this.capabilities;
  }

  async saveCapabilities(): Promise<void> {
    if (!this.capabilities) return;
    await fs.mkdir(getDeltaDir(), { recursive: true });
    await fs.writeFile(getCapabilitiesFile(), JSON.stringify(this.capabilities, null, 2), 'utf-8');
  }

  async getModelCapability(modelName: string): Promise<ModelCapability | undefined> {
    const caps = await this.loadCapabilities();
    return caps[modelName];
  }

  async setModelCapability(modelName: string, cap: ModelCapability): Promise<void> {
    const caps = await this.loadCapabilities();
    caps[modelName] = cap;
    await this.saveCapabilities();
  }

  /**
   * Build a quick-reference list of all known models across all connections.
   * Used by the /model list command and auto-completion.
   */
  async listAllModels(): Promise<Array<{
    model: string;
    connection: string;
    connectionName: string;
    capabilities?: ModelCapability['capabilities'];
  }>> {
    const caps = await this.loadCapabilities();
    const results: Array<{
      model: string;
      connection: string;
      connectionName: string;
      capabilities?: ModelCapability['capabilities'];
    }> = [];

    for (const [modelName, cap] of Object.entries(caps)) {
      const conn = await this.getConnection(cap.connection);
      results.push({
        model: modelName,
        connection: cap.connection,
        connectionName: conn?.name || cap.connection,
        capabilities: cap.capabilities,
      });
    }

    return results;
  }
}

// Singleton for the process — avoids re-reading the file on every command
let _instance: ProviderRegistry | null = null;

export function getProviderRegistry(): ProviderRegistry {
  if (!_instance) {
    _instance = new ProviderRegistry();
  }
  return _instance;
}
