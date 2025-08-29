/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Buffer } from 'buffer';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

import {
  StartSessionEvent,
  EndSessionEvent,
  UserPromptEvent,
  ToolCallEvent,
  ApiRequestEvent,
  ApiResponseEvent,
  ApiErrorEvent,
  FlashFallbackEvent,
  LoopDetectedEvent,
  NextSpeakerCheckEvent,
  SlashCommandEvent,
  MalformedJsonResponseEvent,
  IdeConnectionEvent,
  KittySequenceOverflowEvent,
} from '../types.js';
import {
  RumEvent,
  RumViewEvent,
  RumActionEvent,
  RumResourceEvent,
  RumExceptionEvent,
  RumPayload,
} from './event-types.js';
import { Config } from '../../config/config.js';
import { safeJsonStringify } from '../../utils/safeJsonStringify.js';
import { HttpError, retryWithBackoff } from '../../utils/retry.js';
import { getInstallationId } from '../../utils/user_id.js';
import { FixedDeque } from 'mnemonist';
import { AuthType } from '../../core/contentGenerator.js';

// Usage statistics collection endpoint
const USAGE_STATS_HOSTNAME = 'gb4w8c3ygj-default-sea.rum.aliyuncs.com';
const USAGE_STATS_PATH = '/';

const RUN_APP_ID = 'gb4w8c3ygj@851d5d500f08f92';

/**
 * Interval in which buffered events are sent to RUM.
 */
const FLUSH_INTERVAL_MS = 1000 * 60;

/**
 * Maximum amount of events to keep in memory. Events added after this amount
 * are dropped until the next flush to RUM, which happens periodically as
 * defined by {@link FLUSH_INTERVAL_MS}.
 */
const MAX_EVENTS = 1000;

/**
 * Maximum events to retry after a failed RUM flush
 */
const MAX_RETRY_EVENTS = 100;

export interface LogResponse {
  nextRequestWaitMs?: number;
}

// Singleton class for batch posting log events to RUM. When a new event comes in, the elapsed time
// is checked and events are flushed to RUM if at least a minute has passed since the last flush.
export class DeltaLogger {
  private static instance: DeltaLogger;
  private config?: Config;

  /**
   * Queue of pending events that need to be flushed to the server. New events
   * are added to this queue and then flushed on demand (via `flushToRum`)
   */
  private readonly events: FixedDeque<RumEvent>;

  /**
   * The last time that the events were successfully flushed to the server.
   */
  private lastFlushTime: number = Date.now();

  private userId: string;
  private sessionId: string;

  /**
   * The value is true when there is a pending flush happening. This prevents
   * concurrent flush operations.
   */
  private isFlushInProgress: boolean = false;

  /**
   * This value is true when a flush was requested during an ongoing flush.
   */
  private pendingFlush: boolean = false;

  private isShutdown: boolean = false;

  private constructor(config?: Config) {
    this.config = config;
    this.events = new FixedDeque<RumEvent>(Array, MAX_EVENTS);
    this.userId = this.generateUserId();
    this.sessionId =
      typeof this.config?.getSessionId === 'function'
        ? this.config.getSessionId()
        : '';
  }

  private generateUserId(): string {
    // Use installation ID as user ID for consistency
    return `user-${getInstallationId()}`;
  }

  static getInstance(config?: Config): DeltaLogger | undefined {
    if (config === undefined || !config?.getUsageStatisticsEnabled())
      return undefined;
    if (!DeltaLogger.instance) {
      DeltaLogger.instance = new DeltaLogger(config);
      process.on(
        'exit',
        DeltaLogger.instance.shutdown.bind(DeltaLogger.instance),
      );
    }

    return DeltaLogger.instance;
  }

  enqueueLogEvent(event: RumEvent): void {
    try {
      // Manually handle overflow for FixedDeque, which throws when full.
      const wasAtCapacity = this.events.size >= MAX_EVENTS;

      if (wasAtCapacity) {
        this.events.shift(); // Evict oldest element to make space.
      }

      this.events.push(event);

      if (wasAtCapacity && this.config?.getDebugMode()) {
        console.debug(
          `DeltaLogger: Dropped old event to prevent memory leak (queue size: ${this.events.size})`,
        );
      }
    } catch (error) {
      if (this.config?.getDebugMode()) {
        console.error('DeltaLogger: Failed to enqueue log event.', error);
      }
    }
  }

  createRumEvent(
    eventType: 'view' | 'action' | 'exception' | 'resource',
    type: string,
    name: string,
    properties: Partial<RumEvent>,
  ): RumEvent {
    return {
      timestamp: Date.now(),
      event_type: eventType,
      type,
      name,
      ...(properties || {}),
    };
  }

  createViewEvent(
    type: string,
    name: string,
    properties: Partial<RumViewEvent>,
  ): RumEvent {
    return this.createRumEvent('view', type, name, properties);
  }

  createActionEvent(
    type: string,
    name: string,
    properties: Partial<RumActionEvent>,
  ): RumEvent {
    return this.createRumEvent('action', type, name, properties);
  }

  createResourceEvent(
    type: string,
    name: string,
    properties: Partial<RumResourceEvent>,
  ): RumEvent {
    return this.createRumEvent('resource', type, name, properties);
  }

  createExceptionEvent(
    type: string,
    name: string,
    properties: Partial<RumExceptionEvent>,
  ): RumEvent {
    return this.createRumEvent('exception', type, name, properties);
  }

  async createRumPayload(): Promise<RumPayload> {
    const authType = this.config?.getAuthType();
    const version = this.config?.getCliVersion() || 'unknown';

    return {
      app: {
        id: RUN_APP_ID,
        env: process.env.DEBUG ? 'dev' : 'prod',
        version: version || 'unknown',
        type: 'cli',
      },
      user: {
        id: this.userId,
      },
      session: {
        id: this.sessionId,
      },
      view: {
        id: this.sessionId,
        name: 'delta-code-cli',
      },

      events: this.events.toArray() as RumEvent[],
      properties: {
        auth_type: authType,
        model: this.config?.getModel(),
        base_url:
          authType === AuthType.USE_OPENAI ? process.env.OPENAI_BASE_URL : '',
      },
      _v: `delta-code@${version}`,
    };
  }

  flushIfNeeded(): void {
    if (Date.now() - this.lastFlushTime < FLUSH_INTERVAL_MS) {
      return;
    }

    this.flushToRum().catch((error) => {
      if (this.config?.getDebugMode()) {
        console.debug('Error flushing to RUM:', error);
      }
    });
  }

  async flushToRum(): Promise<LogResponse> {
    if (this.isFlushInProgress) {
      if (this.config?.getDebugMode()) {
        console.debug(
          'DeltaLogger: Flush already in progress, marking pending flush.',
        );
      }
      this.pendingFlush = true;
      return Promise.resolve({});
    }
    this.isFlushInProgress = true;

    if (this.config?.getDebugMode()) {
      console.log('Flushing log events to RUM.');
    }
    if (this.events.size === 0) {
      this.isFlushInProgress = false;
      return {};
    }

    const eventsToSend = this.events.toArray() as RumEvent[];
    this.events.clear();

    const rumPayload = await this.createRumPayload();
    // Override events with the ones we're sending
    rumPayload.events = eventsToSend;
    const flushFn = () =>
      new Promise<Buffer>((resolve, reject) => {
        const body = safeJsonStringify(rumPayload);
        const options = {
          hostname: USAGE_STATS_HOSTNAME,
          path: USAGE_STATS_PATH,
          method: 'POST',
          headers: {
            'Content-Length': Buffer.byteLength(body),
            'Content-Type': 'text/plain;charset=UTF-8',
          },
        };
        const bufs: Buffer[] = [];
        const req = https.request(
          {
            ...options,
            agent: this.getProxyAgent(),
          },
          (res) => {
            if (
              res.statusCode &&
              (res.statusCode < 200 || res.statusCode >= 300)
            ) {
              const err: HttpError = new Error(
                `Request failed with status ${res.statusCode}`,
              );
              err.status = res.statusCode;
              res.resume();
              return reject(err);
            }
            res.on('data', (buf) => bufs.push(buf));
            res.on('end', () => resolve(Buffer.concat(bufs)));
          },
        );
        req.on('error', reject);
        req.end(body);
      });

    try {
      await retryWithBackoff(flushFn, {
        maxAttempts: 3,
        initialDelayMs: 200,
        shouldRetry: (err: unknown) => {
          if (!(err instanceof Error)) return false;
          const status = (err as HttpError).status as number | undefined;
          // If status is not available, it's likely a network error
          if (status === undefined) return true;

          // Retry on 429 (Too many Requests) and 5xx server errors.
          return status === 429 || (status >= 500 && status < 600);
        },
      });

      this.lastFlushTime = Date.now();
      return {};
    } catch (error) {
      if (this.config?.getDebugMode()) {
        console.error('RUM flush failed after multiple retries.', error);
      }

      // Re-queue failed events for retry
      this.requeueFailedEvents(eventsToSend);
      return {};
    } finally {
      this.isFlushInProgress = false;

      // If a flush was requested while we were flushing, flush again
      if (this.pendingFlush) {
        this.pendingFlush = false;
        // Fire and forget the pending flush
        this.flushToRum().catch((error) => {
          if (this.config?.getDebugMode()) {
            console.debug('Error in pending flush to RUM:', error);
          }
        });
      }
    }
  }

  logStartSessionEvent(event: StartSessionEvent): void {
    const applicationEvent = this.createViewEvent('session', 'session_start', {
      properties: {
        model: event.model,
      },
      snapshots: JSON.stringify({
        embedding_model: event.embedding_model,
        sandbox_enabled: event.sandbox_enabled,
        core_tools_enabled: event.core_tools_enabled,
        approval_mode: event.approval_mode,
        api_key_enabled: event.api_key_enabled,
        vertex_ai_enabled: event.vertex_ai_enabled,
        debug_enabled: event.debug_enabled,
        mcp_servers: event.mcp_servers,
        telemetry_enabled: event.telemetry_enabled,
        telemetry_log_user_prompts_enabled:
          event.telemetry_log_user_prompts_enabled,
      }),
    });

    // Flush start event immediately
    this.enqueueLogEvent(applicationEvent);
    this.flushToRum().catch((error: unknown) => {
      if (this.config?.getDebugMode()) {
        console.debug('Error flushing to RUM:', error);
      }
    });
  }

  logNewPromptEvent(event: UserPromptEvent): void {
    const rumEvent = this.createActionEvent('user_prompt', 'user_prompt', {
      properties: {
        auth_type: event.auth_type,
        prompt_id: event.prompt_id,
      },
      snapshots: JSON.stringify({
        prompt_length: event.prompt_length,
      }),
    });

    this.enqueueLogEvent(rumEvent);
    this.flushIfNeeded();
  }

  logToolCallEvent(event: ToolCallEvent): void {
    const rumEvent = this.createActionEvent(
      'tool_call',
      `tool_call#${event.function_name}`,
      {
        properties: {
          prompt_id: event.prompt_id,
        },
        snapshots: JSON.stringify({
          function_name: event.function_name,
          decision: event.decision,
          success: event.success,
          duration_ms: event.duration_ms,
          error: event.error,
          error_type: event.error_type,
        }),
      },
    );

    this.enqueueLogEvent(rumEvent);
    this.flushIfNeeded();
  }

  logApiRequestEvent(event: ApiRequestEvent): void {
    const rumEvent = this.createResourceEvent('api', 'api_request', {
      properties: {
        model: event.model,
        prompt_id: event.prompt_id,
      },
    });

    this.enqueueLogEvent(rumEvent);
    this.flushIfNeeded();
  }

  logApiResponseEvent(event: ApiResponseEvent): void {
    const rumEvent = this.createResourceEvent('api', 'api_response', {
      status_code: event.status_code?.toString() ?? '',
      duration: event.duration_ms,
      success: 1,
      message: event.error,
      trace_id: event.response_id,
      properties: {
        auth_type: event.auth_type,
        model: event.model,
        prompt_id: event.prompt_id,
      },
      snapshots: JSON.stringify({
        input_token_count: event.input_token_count,
        output_token_count: event.output_token_count,
        cached_content_token_count: event.cached_content_token_count,
        thoughts_token_count: event.thoughts_token_count,
        tool_token_count: event.tool_token_count,
      }),
    });

    this.enqueueLogEvent(rumEvent);
    this.flushIfNeeded();
  }

  logApiErrorEvent(event: ApiErrorEvent): void {
    const rumEvent = this.createResourceEvent('api', 'api_error', {
      status_code: event.status_code?.toString() ?? '',
      duration: event.duration_ms,
      success: 0,
      message: event.error,
      trace_id: event.response_id,
      properties: {
        auth_type: event.auth_type,
        model: event.model,
        prompt_id: event.prompt_id,
      },
      snapshots: JSON.stringify({
        error_type: event.error_type,
      }),
    });

    this.enqueueLogEvent(rumEvent);
    this.flushIfNeeded();
  }

  logFlashFallbackEvent(event: FlashFallbackEvent): void {
    const rumEvent = this.createActionEvent('fallback', 'flash_fallback', {
      properties: {
        auth_type: event.auth_type,
      },
    });

    this.enqueueLogEvent(rumEvent);
    this.flushIfNeeded();
  }

  logLoopDetectedEvent(event: LoopDetectedEvent): void {
    const rumEvent = this.createExceptionEvent('error', 'loop_detected', {
      subtype: 'loop_detected',
      properties: {
        prompt_id: event.prompt_id,
      },
      snapshots: JSON.stringify({
        loop_type: event.loop_type,
      }),
    });

    this.enqueueLogEvent(rumEvent);
    this.flushIfNeeded();
  }

  logNextSpeakerCheck(event: NextSpeakerCheckEvent): void {
    const rumEvent = this.createActionEvent('check', 'next_speaker_check', {
      properties: {
        prompt_id: event.prompt_id,
      },
      snapshots: JSON.stringify({
        finish_reason: event.finish_reason,
        result: event.result,
      }),
    });

    this.enqueueLogEvent(rumEvent);
    this.flushIfNeeded();
  }

  logSlashCommandEvent(event: SlashCommandEvent): void {
    const rumEvent = this.createActionEvent('command', 'slash_command', {
      snapshots: JSON.stringify({
        command: event.command,
        subcommand: event.subcommand,
      }),
    });

    this.enqueueLogEvent(rumEvent);
    this.flushIfNeeded();
  }

  logMalformedJsonResponseEvent(event: MalformedJsonResponseEvent): void {
    const rumEvent = this.createExceptionEvent(
      'error',
      'malformed_json_response',
      {
        subtype: 'malformed_json_response',
        properties: {
          model: event.model,
        },
      },
    );

    this.enqueueLogEvent(rumEvent);
    this.flushIfNeeded();
  }

  logIdeConnectionEvent(event: IdeConnectionEvent): void {
    const rumEvent = this.createActionEvent('connection', 'ide_connection', {
      snapshots: JSON.stringify({ connection_type: event.connection_type }),
    });

    this.enqueueLogEvent(rumEvent);
    this.flushIfNeeded();
  }

  logKittySequenceOverflowEvent(event: KittySequenceOverflowEvent): void {
    const rumEvent = this.createExceptionEvent(
      'overflow',
      'kitty_sequence_overflow',
      {
        subtype: 'kitty_sequence_overflow',
        snapshots: JSON.stringify({
          sequence_length: event.sequence_length,
          truncated_sequence: event.truncated_sequence,
        }),
      },
    );

    this.enqueueLogEvent(rumEvent);
    this.flushIfNeeded();
  }

  logEndSessionEvent(_event: EndSessionEvent): void {
    const applicationEvent = this.createViewEvent('session', 'session_end', {});

    // Flush immediately on session end.
    this.enqueueLogEvent(applicationEvent);
    this.flushToRum().catch((error: unknown) => {
      if (this.config?.getDebugMode()) {
        console.debug('Error flushing to RUM:', error);
      }
    });
  }

  getProxyAgent() {
    const proxyUrl = this.config?.getProxy();
    if (!proxyUrl) return undefined;
    // undici which is widely used in the repo can only support http & https proxy protocol,
    // https://github.com/nodejs/undici/issues/2224
    if (proxyUrl.startsWith('http')) {
      return new HttpsProxyAgent(proxyUrl);
    } else {
      throw new Error('Unsupported proxy type');
    }
  }

  shutdown() {
    if (this.isShutdown) return;

    this.isShutdown = true;
    const event = new EndSessionEvent(this.config);
    this.logEndSessionEvent(event);
  }

  private requeueFailedEvents(eventsToSend: RumEvent[]): void {
    // Add the events back to the front of the queue to be retried, but limit retry queue size
    const eventsToRetry = eventsToSend.slice(-MAX_RETRY_EVENTS); // Keep only the most recent events

    // Log a warning if we're dropping events
    if (eventsToSend.length > MAX_RETRY_EVENTS && this.config?.getDebugMode()) {
      console.warn(
        `DeltaLogger: Dropping ${
          eventsToSend.length - MAX_RETRY_EVENTS
        } events due to retry queue limit. Total events: ${
          eventsToSend.length
        }, keeping: ${MAX_RETRY_EVENTS}`,
      );
    }

    // Determine how many events can be re-queued
    const availableSpace = MAX_EVENTS - this.events.size;
    const numEventsToRequeue = Math.min(eventsToRetry.length, availableSpace);

    if (numEventsToRequeue === 0) {
      if (this.config?.getDebugMode()) {
        console.debug(
          `DeltaLogger: No events re-queued (queue size: ${this.events.size})`,
        );
      }
      return;
    }

    // Get the most recent events to re-queue
    const eventsToRequeue = eventsToRetry.slice(
      eventsToRetry.length - numEventsToRequeue,
    );

    // Prepend events to the front of the deque to be retried first.
    // We iterate backwards to maintain the original order of the failed events.
    for (let i = eventsToRequeue.length - 1; i >= 0; i--) {
      this.events.unshift(eventsToRequeue[i]);
    }
    // Clear any potential overflow
    while (this.events.size > MAX_EVENTS) {
      this.events.pop();
    }

    if (this.config?.getDebugMode()) {
      console.debug(
        `DeltaLogger: Re-queued ${numEventsToRequeue} events for retry (queue size: ${this.events.size})`,
      );
    }
  }
}

export const TEST_ONLY = {
  MAX_RETRY_EVENTS,
  MAX_EVENTS,
  FLUSH_INTERVAL_MS,
};
