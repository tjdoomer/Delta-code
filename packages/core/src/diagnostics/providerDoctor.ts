/**
 * Provider health-check diagnostics.
 *
 * Validates environment variables, probes API endpoints, detects local
 * model servers, and checks the active model's capabilities. Used by the
 * /doctor slash command to surface configuration issues before a session
 * goes sideways.
 */

import { getProviderRegistry } from '../config/providerRegistry.js';
import { probeEndpoint } from '../providers/localModelDiscovery.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface DiagnosticCheck {
  category: string;
  name: string;
  status: CheckStatus;
  message: string;
}

export interface DiagnosticReport {
  checks: DiagnosticCheck[];
  summary: { pass: number; warn: number; fail: number; skip: number };
}

// ---------------------------------------------------------------------------
// Known env vars and their providers
// ---------------------------------------------------------------------------

const ENV_VAR_MAP: Array<{ key: string; provider: string; required: boolean }> = [
  { key: 'OPENAI_API_KEY', provider: 'OpenAI', required: false },
  { key: 'OPENAI_BASE_URL', provider: 'OpenAI (custom endpoint)', required: false },
  { key: 'OPENAI_MODEL', provider: 'OpenAI (model override)', required: false },
  { key: 'ANTHROPIC_API_KEY', provider: 'Anthropic', required: false },
  { key: 'CLAUDE_MODEL', provider: 'Claude (model override)', required: false },
  { key: 'GEMINI_API_KEY', provider: 'Gemini', required: false },
  { key: 'GOOGLE_API_KEY', provider: 'Google Cloud', required: false },
  { key: 'GOOGLE_CLOUD_PROJECT', provider: 'Vertex AI', required: false },
  { key: 'AWS_ACCESS_KEY_ID', provider: 'AWS Bedrock', required: false },
  { key: 'AWS_SECRET_ACCESS_KEY', provider: 'AWS Bedrock', required: false },
  { key: 'TAVILY_API_KEY', provider: 'Tavily (web search)', required: false },
];

// Patterns that indicate a placeholder/dummy key, not a real one
const PLACEHOLDER_PATTERNS = [
  /^sk-xxx/i,
  /YOUR[_-]?KEY/i,
  /YOUR[_-]?API/i,
  /SUA[_-]?CHAVE/i,
  /REPLACE[_-]?ME/i,
  /^test[-_]?key$/i,
  /^placeholder$/i,
  /^changeme$/i,
];

// ---------------------------------------------------------------------------
// Check runners
// ---------------------------------------------------------------------------

/** Scan environment variables for API keys and flag issues. */
function checkEnvironment(): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

  for (const { key, provider } of ENV_VAR_MAP) {
    const value = process.env[key];

    if (!value) {
      checks.push({
        category: 'Environment',
        name: key,
        status: 'skip',
        message: `${provider} — not set`,
      });
      continue;
    }

    // Check for placeholder values
    const isPlaceholder = PLACEHOLDER_PATTERNS.some(p => p.test(value));
    if (isPlaceholder) {
      checks.push({
        category: 'Environment',
        name: key,
        status: 'warn',
        message: `${provider} — looks like a placeholder ("${value.substring(0, 12)}...")`,
      });
      continue;
    }

    // Mask the actual value for display
    const masked = value.length > 8
      ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
      : '****';

    checks.push({
      category: 'Environment',
      name: key,
      status: 'pass',
      message: `${provider} — set (${masked})`,
    });
  }

  return checks;
}

/** Probe well-known local endpoints (LM Studio, Ollama). */
async function checkLocalServers(): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];

  // Check common local endpoints
  const endpoints = [
    { url: 'http://localhost:1234', label: 'LM Studio (localhost:1234)' },
    { url: 'http://localhost:11434', label: 'Ollama (localhost:11434)' },
  ];

  for (const { url, label } of endpoints) {
    const result = await probeEndpoint(url);

    if (result) {
      checks.push({
        category: 'Local Servers',
        name: label,
        status: 'pass',
        message: `reachable, ${result.modelCount} model(s) loaded`,
      });
    } else {
      checks.push({
        category: 'Local Servers',
        name: label,
        status: 'skip',
        message: 'not running',
      });
    }
  }

  return checks;
}

/** Check saved connections from the provider registry. */
async function checkRegisteredConnections(): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];
  const registry = getProviderRegistry();
  const connections = await registry.getConnections();

  if (connections.length === 0) {
    checks.push({
      category: 'Registry',
      name: 'Saved connections',
      status: 'skip',
      message: 'No connections saved. Use /model add to register one.',
    });
    return checks;
  }

  for (const conn of connections) {
    if (!conn.baseUrl) {
      checks.push({
        category: 'Registry',
        name: conn.name,
        status: 'warn',
        message: `${conn.type} — no base URL configured`,
      });
      continue;
    }

    // For connections with auto-discover, probe the endpoint
    if (conn.autoDiscover) {
      const result = await probeEndpoint(conn.baseUrl);
      if (result) {
        checks.push({
          category: 'Registry',
          name: conn.name,
          status: 'pass',
          message: `${conn.type} — reachable (${conn.baseUrl}), ${result.modelCount} model(s)`,
        });
      } else {
        checks.push({
          category: 'Registry',
          name: conn.name,
          status: 'fail',
          message: `${conn.type} — unreachable (${conn.baseUrl})`,
        });
      }
    } else {
      // API connections — check if key is configured
      if (conn.apiKey) {
        checks.push({
          category: 'Registry',
          name: conn.name,
          status: 'pass',
          message: `${conn.type} — API key configured`,
        });
      } else {
        checks.push({
          category: 'Registry',
          name: conn.name,
          status: 'warn',
          message: `${conn.type} — no API key`,
        });
      }
    }
  }

  return checks;
}

/** Check the currently active model. */
function checkActiveModel(
  currentModel: string | undefined,
  authType: string | undefined,
): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];

  if (!currentModel || currentModel === 'unknown') {
    checks.push({
      category: 'Active Model',
      name: 'Model',
      status: 'fail',
      message: 'No model configured',
    });
    return checks;
  }

  checks.push({
    category: 'Active Model',
    name: 'Model',
    status: 'pass',
    message: `${currentModel} via ${authType || 'unknown'}`,
  });

  return checks;
}

// ---------------------------------------------------------------------------
// Main diagnostic runner
// ---------------------------------------------------------------------------

export async function runDiagnostics(opts: {
  currentModel?: string;
  authType?: string;
}): Promise<DiagnosticReport> {
  // Run all checks — env checks are sync, connectivity checks are async
  const [envChecks, localChecks, registryChecks] = await Promise.all([
    Promise.resolve(checkEnvironment()),
    checkLocalServers(),
    checkRegisteredConnections(),
  ]);

  const modelChecks = checkActiveModel(opts.currentModel, opts.authType);

  const allChecks = [
    ...envChecks,
    ...localChecks,
    ...registryChecks,
    ...modelChecks,
  ];

  const summary = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const check of allChecks) {
    summary[check.status]++;
  }

  return { checks: allChecks, summary };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const STATUS_ICONS: Record<CheckStatus, string> = {
  pass: '\x1b[32m✓\x1b[0m',
  warn: '\x1b[33m⚠\x1b[0m',
  fail: '\x1b[31m✗\x1b[0m',
  skip: '\x1b[90m─\x1b[0m',
};

export function formatReport(report: DiagnosticReport): string {
  const lines: string[] = ['\x1b[1mProvider Health Check\x1b[0m', '─'.repeat(40), ''];

  let currentCategory = '';

  for (const check of report.checks) {
    if (check.category !== currentCategory) {
      if (currentCategory) lines.push('');
      lines.push(`\x1b[1m${check.category}\x1b[0m`);
      currentCategory = check.category;
    }

    const icon = STATUS_ICONS[check.status];
    lines.push(`  ${icon} ${check.name}  \x1b[90m→ ${check.message}\x1b[0m`);
  }

  lines.push('');
  const { pass, warn, fail } = report.summary;
  const parts: string[] = [];
  if (pass > 0) parts.push(`\x1b[32m${pass} passed\x1b[0m`);
  if (warn > 0) parts.push(`\x1b[33m${warn} warning(s)\x1b[0m`);
  if (fail > 0) parts.push(`\x1b[31m${fail} failed\x1b[0m`);
  lines.push(parts.join(', '));

  return lines.join('\n');
}
