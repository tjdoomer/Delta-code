import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runDiagnostics, formatReport } from './providerDoctor.js';

// Mock the registry and discovery modules so tests don't hit real endpoints
vi.mock('../config/providerRegistry.js', () => ({
  getProviderRegistry: () => ({
    getConnections: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('../providers/localModelDiscovery.js', () => ({
  probeEndpoint: vi.fn().mockResolvedValue(null),
}));

describe('providerDoctor', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clean env for each test
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.TAVILY_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('environment checks', () => {
    it('should detect set API keys', async () => {
      process.env.OPENAI_API_KEY = 'sk-realkey1234567890abcdef';

      const report = await runDiagnostics({
        currentModel: 'gpt-4o',
        authType: 'openai',
      });

      const openaiCheck = report.checks.find(c => c.name === 'OPENAI_API_KEY');
      expect(openaiCheck?.status).toBe('pass');
      expect(openaiCheck?.message).toContain('set');
    });

    it('should flag placeholder keys', async () => {
      process.env.OPENAI_API_KEY = 'sk-xxx-placeholder';

      const report = await runDiagnostics({
        currentModel: 'gpt-4o',
        authType: 'openai',
      });

      const openaiCheck = report.checks.find(c => c.name === 'OPENAI_API_KEY');
      expect(openaiCheck?.status).toBe('warn');
      expect(openaiCheck?.message).toContain('placeholder');
    });

    it('should skip unset keys', async () => {
      const report = await runDiagnostics({
        currentModel: 'gpt-4o',
        authType: 'openai',
      });

      const openaiCheck = report.checks.find(c => c.name === 'OPENAI_API_KEY');
      expect(openaiCheck?.status).toBe('skip');
    });
  });

  describe('active model check', () => {
    it('should pass when model is configured', async () => {
      const report = await runDiagnostics({
        currentModel: 'gpt-4o',
        authType: 'openai',
      });

      const modelCheck = report.checks.find(c => c.category === 'Active Model');
      expect(modelCheck?.status).toBe('pass');
      expect(modelCheck?.message).toContain('gpt-4o');
    });

    it('should fail when no model is configured', async () => {
      const report = await runDiagnostics({
        currentModel: undefined,
        authType: undefined,
      });

      const modelCheck = report.checks.find(c => c.category === 'Active Model');
      expect(modelCheck?.status).toBe('fail');
    });
  });

  describe('summary', () => {
    it('should count statuses correctly', async () => {
      process.env.OPENAI_API_KEY = 'sk-realkey1234567890abcdef';

      const report = await runDiagnostics({
        currentModel: 'gpt-4o',
        authType: 'openai',
      });

      // Should have at least 1 pass (OPENAI_API_KEY) and 1 pass (active model)
      expect(report.summary.pass).toBeGreaterThanOrEqual(2);
      // Total should equal all checks
      const total = report.summary.pass + report.summary.warn + report.summary.fail + report.summary.skip;
      expect(total).toBe(report.checks.length);
    });
  });

  describe('formatReport', () => {
    it('should produce readable output', async () => {
      const report = await runDiagnostics({
        currentModel: 'gpt-4o',
        authType: 'openai',
      });

      const output = formatReport(report);
      expect(output).toContain('Provider Health Check');
      expect(output).toContain('Environment');
      expect(output).toContain('Active Model');
    });
  });
});
