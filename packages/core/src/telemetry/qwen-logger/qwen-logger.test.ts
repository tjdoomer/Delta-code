/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  afterAll,
} from 'vitest';
import { DeltaLogger, TEST_ONLY } from '../delta-logger.js';
import { Config } from '../../config/config.js';
import {
  StartSessionEvent,
  EndSessionEvent,
  IdeConnectionEvent,
  KittySequenceOverflowEvent,
  IdeConnectionType,
} from '../types.js';
import { RumEvent } from '../event-types.js';

// Mock dependencies
vi.mock('../../utils/user_id.js', () => ({
  getInstallationId: vi.fn(() => 'test-installation-id'),
}));

vi.mock('../../utils/safeJsonStringify.js', () => ({
  safeJsonStringify: vi.fn((obj) => JSON.stringify(obj)),
}));

// Mock https module
vi.mock('https', () => ({
  request: vi.fn(),
}));

const makeFakeConfig = (overrides: Partial<Config> = {}): Config => {
  const defaults = {
    getUsageStatisticsEnabled: () => true,
    getDebugMode: () => false,
    getSessionId: () => 'test-session-id',
    getCliVersion: () => '1.0.0',
    getProxy: () => undefined,
    getContentGeneratorConfig: () => ({ authType: 'test-auth' }),
    getMcpServers: () => ({}),
    getModel: () => 'test-model',
    getEmbeddingModel: () => 'test-embedding',
    getSandbox: () => false,
    getCoreTools: () => [],
    getApprovalMode: () => 'auto',
    getTelemetryEnabled: () => true,
    getTelemetryLogPromptsEnabled: () => false,
    getFileFilteringRespectGitIgnore: () => true,
    ...overrides,
  };
  return defaults as Config;
};

describe('DeltaLogger', () => {
  let mockConfig: Config;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T12:00:00.000Z'));
    mockConfig = makeFakeConfig();
    // Clear singleton instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DeltaLogger as any).instance = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DeltaLogger as any).instance = undefined;
  });

  describe('getInstance', () => {
    it('returns undefined when usage statistics are disabled', () => {
      const config = makeFakeConfig({ getUsageStatisticsEnabled: () => false });
      const logger = DeltaLogger.getInstance(config);
      expect(logger).toBeUndefined();
    });

    it('returns an instance when usage statistics are enabled', () => {
      const logger = DeltaLogger.getInstance(mockConfig);
      expect(logger).toBeInstanceOf(DeltaLogger);
    });

    it('is a singleton', () => {
      const logger1 = DeltaLogger.getInstance(mockConfig);
      const logger2 = DeltaLogger.getInstance(mockConfig);
      expect(logger1).toBe(logger2);
    });
  });

  describe('event queue management', () => {
    it('should handle event overflow gracefully', () => {
      const debugConfig = makeFakeConfig({ getDebugMode: () => true });
      const logger = DeltaLogger.getInstance(debugConfig)!;
      const consoleSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      // Fill the queue beyond capacity
      for (let i = 0; i < TEST_ONLY.MAX_EVENTS + 10; i++) {
        logger.enqueueLogEvent({
          timestamp: Date.now(),
          event_type: 'action',
          type: 'test',
          name: `test-event-${i}`,
        });
      }

      // Should have logged debug messages about dropping events
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'DeltaLogger: Dropped old event to prevent memory leak',
        ),
      );
    });

    it('should handle enqueue errors gracefully', () => {
      const debugConfig = makeFakeConfig({ getDebugMode: () => true });
      const logger = DeltaLogger.getInstance(debugConfig)!;
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Mock the events deque to throw an error
      const originalPush = logger['events'].push;
      logger['events'].push = vi.fn(() => {
        throw new Error('Test error');
      });

      logger.enqueueLogEvent({
        timestamp: Date.now(),
        event_type: 'action',
        type: 'test',
        name: 'test-event',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'DeltaLogger: Failed to enqueue log event.',
        expect.any(Error),
      );

      // Restore original method
      logger['events'].push = originalPush;
    });
  });

  describe('concurrent flush protection', () => {
    it('should handle concurrent flush requests', () => {
      const debugConfig = makeFakeConfig({ getDebugMode: () => true });
      const logger = DeltaLogger.getInstance(debugConfig)!;
      const consoleSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      // Manually set the flush in progress flag to simulate concurrent access
      logger['isFlushInProgress'] = true;

      // Try to flush while another flush is in progress
      const result = logger.flushToRum();

      // Should have logged about pending flush
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'DeltaLogger: Flush already in progress, marking pending flush',
        ),
      );

      // Should return a resolved promise
      expect(result).toBeInstanceOf(Promise);

      // Reset the flag
      logger['isFlushInProgress'] = false;
    });
  });

  describe('failed event retry mechanism', () => {
    it('should requeue failed events with size limits', () => {
      const debugConfig = makeFakeConfig({ getDebugMode: () => true });
      const logger = DeltaLogger.getInstance(debugConfig)!;
      const consoleSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      const failedEvents: RumEvent[] = [];
      for (let i = 0; i < TEST_ONLY.MAX_RETRY_EVENTS + 50; i++) {
        failedEvents.push({
          timestamp: Date.now(),
          event_type: 'action',
          type: 'test',
          name: `failed-event-${i}`,
        });
      }

      // Call the private method using bracket notation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (logger as any).requeueFailedEvents(failedEvents);

      // Should have logged about dropping events due to retry limit
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('DeltaLogger: Re-queued'),
      );
    });

    it('should handle empty retry queue gracefully', () => {
      const debugConfig = makeFakeConfig({ getDebugMode: () => true });
      const logger = DeltaLogger.getInstance(debugConfig)!;
      const consoleSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      // Fill the queue to capacity first
      for (let i = 0; i < TEST_ONLY.MAX_EVENTS; i++) {
        logger.enqueueLogEvent({
          timestamp: Date.now(),
          event_type: 'action',
          type: 'test',
          name: `event-${i}`,
        });
      }

      // Try to requeue when no space is available
      const failedEvents: RumEvent[] = [
        {
          timestamp: Date.now(),
          event_type: 'action',
          type: 'test',
          name: 'failed-event',
        },
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (logger as any).requeueFailedEvents(failedEvents);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('DeltaLogger: No events re-queued'),
      );
    });
  });

  describe('event handlers', () => {
    it('should log IDE connection events', () => {
      const logger = DeltaLogger.getInstance(mockConfig)!;
      const enqueueSpy = vi.spyOn(logger, 'enqueueLogEvent');

      const event = new IdeConnectionEvent(IdeConnectionType.SESSION);

      logger.logIdeConnectionEvent(event);

      expect(enqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'action',
          type: 'connection',
          name: 'ide_connection',
          snapshots: JSON.stringify({
            connection_type: IdeConnectionType.SESSION,
          }),
        }),
      );
    });

    it('should log Kitty sequence overflow events', () => {
      const logger = DeltaLogger.getInstance(mockConfig)!;
      const enqueueSpy = vi.spyOn(logger, 'enqueueLogEvent');

      const event = new KittySequenceOverflowEvent(1024, 'truncated...');

      logger.logKittySequenceOverflowEvent(event);

      expect(enqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'exception',
          type: 'overflow',
          name: 'kitty_sequence_overflow',
          subtype: 'kitty_sequence_overflow',
          snapshots: JSON.stringify({
            sequence_length: 1024,
            truncated_sequence: 'truncated...',
          }),
        }),
      );
    });

    it('should flush start session events immediately', async () => {
      const logger = DeltaLogger.getInstance(mockConfig)!;
      const flushSpy = vi.spyOn(logger, 'flushToRum').mockResolvedValue({});

      const testConfig = makeFakeConfig({
        getModel: () => 'test-model',
        getEmbeddingModel: () => 'test-embedding',
      });
      const event = new StartSessionEvent(testConfig);

      logger.logStartSessionEvent(event);

      expect(flushSpy).toHaveBeenCalled();
    });

    it('should flush end session events immediately', async () => {
      const logger = DeltaLogger.getInstance(mockConfig)!;
      const flushSpy = vi.spyOn(logger, 'flushToRum').mockResolvedValue({});

      const event = new EndSessionEvent(mockConfig);

      logger.logEndSessionEvent(event);

      expect(flushSpy).toHaveBeenCalled();
    });
  });

  describe('flush timing', () => {
    it('should not flush if interval has not passed', () => {
      const logger = DeltaLogger.getInstance(mockConfig)!;
      const flushSpy = vi.spyOn(logger, 'flushToRum');

      // Add an event and try to flush immediately
      logger.enqueueLogEvent({
        timestamp: Date.now(),
        event_type: 'action',
        type: 'test',
        name: 'test-event',
      });

      logger.flushIfNeeded();

      expect(flushSpy).not.toHaveBeenCalled();
    });

    it('should flush when interval has passed', () => {
      const logger = DeltaLogger.getInstance(mockConfig)!;
      const flushSpy = vi.spyOn(logger, 'flushToRum').mockResolvedValue({});

      // Add an event
      logger.enqueueLogEvent({
        timestamp: Date.now(),
        event_type: 'action',
        type: 'test',
        name: 'test-event',
      });

      // Advance time beyond flush interval
      vi.advanceTimersByTime(TEST_ONLY.FLUSH_INTERVAL_MS + 1000);

      logger.flushIfNeeded();

      expect(flushSpy).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle flush errors gracefully with debug mode', async () => {
      const debugConfig = makeFakeConfig({ getDebugMode: () => true });
      const logger = DeltaLogger.getInstance(debugConfig)!;
      const consoleSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      // Add an event first
      logger.enqueueLogEvent({
        timestamp: Date.now(),
        event_type: 'action',
        type: 'test',
        name: 'test-event',
      });

      // Mock flushToRum to throw an error
      const originalFlush = logger.flushToRum.bind(logger);
      logger.flushToRum = vi.fn().mockRejectedValue(new Error('Network error'));

      // Advance time to trigger flush
      vi.advanceTimersByTime(TEST_ONLY.FLUSH_INTERVAL_MS + 1000);

      logger.flushIfNeeded();

      // Wait for async operations
      await vi.runAllTimersAsync();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error flushing to RUM:',
        expect.any(Error),
      );

      // Restore original method
      logger.flushToRum = originalFlush;
    });
  });

  describe('constants export', () => {
    it('should export test constants', () => {
      expect(TEST_ONLY.MAX_EVENTS).toBe(1000);
      expect(TEST_ONLY.MAX_RETRY_EVENTS).toBe(100);
      expect(TEST_ONLY.FLUSH_INTERVAL_MS).toBe(60000);
    });
  });
});
