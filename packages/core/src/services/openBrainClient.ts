/**
 * Fire-and-forget HTTP client for OpenBrain (localhost:8766).
 *
 * All calls are non-blocking — if OpenBrain is down, we silently skip.
 * The coding session works identically with or without OpenBrain running.
 */

const DEFAULT_URL = 'http://localhost:8766';

interface CapturePayload {
  room: string;
  sender_id: string;
  sender_name: string;
  sender_type: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export class OpenBrainClient {
  private baseUrl: string;
  private available: boolean | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || DEFAULT_URL;
  }

  /**
   * Fire-and-forget capture — logs content to OpenBrain's /api/capture endpoint.
   * Never throws, never blocks. Returns true if sent, false if skipped.
   */
  async capture(payload: CapturePayload): Promise<boolean> {
    // Quick check: if we already know OpenBrain is down, skip immediately
    if (this.available === false) return false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${this.baseUrl}/api/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      this.available = response.ok;
      return response.ok;
    } catch {
      this.available = false;
      return false;
    }
  }

  /**
   * Log a checkpoint event to OpenBrain.
   */
  async logCheckpoint(event: {
    type: 'save' | 'restore';
    label: string;
    reason?: string;
    commitSha?: string;
    repo?: string;
    branch?: string;
    filesChanged?: string[];
  }): Promise<void> {
    const action = event.type === 'save' ? 'CHECKPOINT SAVE' : 'CHECKPOINT RESTORE';
    const reasonText = event.reason ? ` — ${event.reason}` : '';
    const filesText = event.filesChanged?.length
      ? `\n\nFiles: ${event.filesChanged.join(', ')}`
      : '';

    await this.capture({
      room: 'delta-code',
      sender_id: 'delta-code',
      sender_name: 'Delta Code',
      sender_type: 'tool',
      content: `[${action}] "${event.label}"${reasonText}${filesText}`,
      metadata: {
        event_type: `checkpoint_${event.type}`,
        label: event.label,
        reason: event.reason,
        commit_sha: event.commitSha,
        repo: event.repo,
        branch: event.branch,
        files_changed: event.filesChanged,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /** Reset availability check (e.g. if user starts OpenBrain mid-session). */
  resetAvailability(): void {
    this.available = null;
  }
}

// Singleton — shared across the session
let _instance: OpenBrainClient | null = null;

export function getOpenBrainClient(baseUrl?: string): OpenBrainClient {
  if (!_instance) {
    _instance = new OpenBrainClient(baseUrl);
  }
  return _instance;
}
