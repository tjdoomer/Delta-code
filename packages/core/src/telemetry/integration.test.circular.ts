/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Integration test to verify circular reference handling with proxy agents
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DeltaLogger } from './delta-logger.js';
import { RumEvent } from './event-types.js';
import { Config } from '../config/config.js';

describe('Circular Reference Integration Test', () => {
  beforeEach(() => {
    // Clear singleton instance before each test
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DeltaLogger as any).instance = undefined;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DeltaLogger as any).instance = undefined;
  });

  it('should handle HttpsProxyAgent-like circular references in delta logging', () => {
    // Create a mock config with proxy
    const mockConfig = {
      getTelemetryEnabled: () => true,
      getUsageStatisticsEnabled: () => true,
      getSessionId: () => 'test-session',
      getModel: () => 'test-model',
      getEmbeddingModel: () => 'test-embedding',
      getDebugMode: () => false,
      getProxy: () => 'http://proxy.example.com:8080',
    } as unknown as Config;

    // Simulate the structure that causes the circular reference error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proxyAgentLike: any = {
      sockets: {},
      options: { proxy: 'http://proxy.example.com:8080' },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const socketLike: any = {
      _httpMessage: {
        agent: proxyAgentLike,
        socket: null,
      },
    };

    socketLike._httpMessage.socket = socketLike; // Create circular reference
    proxyAgentLike.sockets['cloudcode-pa.googleapis.com:443'] = [socketLike];

    // Create an event that would contain this circular structure
    const problematicEvent: RumEvent = {
      timestamp: Date.now(),
      event_type: 'exception',
      type: 'error',
      name: 'api_error',
      error: new Error('Network error'),
      function_args: {
        filePath: '/test/file.txt',
        httpAgent: proxyAgentLike, // This would cause the circular reference
      },
    } as RumEvent;

    // Test that DeltaLogger can handle this
    const logger = DeltaLogger.getInstance(mockConfig);

    expect(() => {
      logger?.enqueueLogEvent(problematicEvent);
    }).not.toThrow();
  });

  it('should handle event overflow without memory leaks', () => {
    const mockConfig = {
      getTelemetryEnabled: () => true,
      getUsageStatisticsEnabled: () => true,
      getSessionId: () => 'test-session',
      getDebugMode: () => true,
    } as unknown as Config;

    const logger = DeltaLogger.getInstance(mockConfig);

    // Add more events than the maximum capacity
    for (let i = 0; i < 1100; i++) {
      logger?.enqueueLogEvent({
        timestamp: Date.now(),
        event_type: 'action',
        type: 'test',
        name: `overflow-test-${i}`,
      });
    }

    // Logger should still be functional
    expect(logger).toBeDefined();
    expect(() => {
      logger?.enqueueLogEvent({
        timestamp: Date.now(),
        event_type: 'action',
        type: 'test',
        name: 'final-test',
      });
    }).not.toThrow();
  });
});
