/**
 * Shared parser for <think>...</think> XML tags emitted by reasoning models
 * (DeepSeek-R1, QwQ, Qwen3-coder, etc).
 *
 * Instead of stripping think blocks, we extract them so they can be surfaced
 * as { thought: true, text: "..." } parts — which the existing Turn system
 * already handles via DeltaEventType.Thought.
 */

export interface ParsedContent {
  /** Regular text content (outside think blocks) */
  text: string;
  /** Extracted think block content, if any */
  thinkContent: string | null;
}

/**
 * Extract <think>...</think> blocks from a complete response string.
 * Returns the visible text and the think content separately.
 *
 * Used by the non-streaming path where the full response is available.
 */
export function extractThinkBlocks(content: string): ParsedContent {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  const thinkParts: string[] = [];
  let match;

  while ((match = thinkRegex.exec(content)) !== null) {
    const thinkText = match[1].trim();
    if (thinkText) {
      thinkParts.push(thinkText);
    }
  }

  const text = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const thinkContent = thinkParts.length > 0 ? thinkParts.join('\n\n') : null;

  return { text, thinkContent };
}

// ---------------------------------------------------------------------------
// Streaming think block extractor
// ---------------------------------------------------------------------------

/**
 * Stateful streaming parser that handles <think> tags spanning multiple chunks.
 *
 * Replaces the old filterThinkTags approach which stripped content. This version
 * extracts think content into a separate buffer so it can be yielded as thought
 * parts to the Turn system.
 */
export class StreamingThinkExtractor {
  private insideThinkBlock = false;
  private tagBuffer = '';
  private thinkAccumulator = '';

  /** Reset state between streams. */
  reset(): void {
    this.insideThinkBlock = false;
    this.tagBuffer = '';
    this.thinkAccumulator = '';
  }

  /**
   * Process a streaming text chunk. Returns the visible text and any
   * completed think content.
   *
   * Think content is only returned when a </think> close tag is found,
   * meaning the reasoning block is complete. Partial reasoning stays
   * buffered until the block closes.
   */
  process(chunk: string): { visibleText: string; completedThink: string | null } {
    // Prepend any buffered partial tag from previous chunk
    let text = this.tagBuffer + chunk;
    this.tagBuffer = '';

    let visibleText = '';
    let completedThink: string | null = null;
    let i = 0;

    while (i < text.length) {
      if (this.insideThinkBlock) {
        const closeIdx = text.indexOf('</think>', i);
        if (closeIdx !== -1) {
          // Capture the think content up to the close tag
          this.thinkAccumulator += text.substring(i, closeIdx);
          completedThink = this.thinkAccumulator.trim() || null;
          this.thinkAccumulator = '';
          this.insideThinkBlock = false;
          i = closeIdx + '</think>'.length;
        } else {
          // No close tag yet — check for partial </think> at chunk boundary
          const tailLen = Math.min(text.length - i, 8);
          const tail = text.substring(text.length - tailLen);
          if ('</think>'.startsWith(tail) && tail.length < '</think>'.length) {
            // Buffer the potential partial tag, accumulate everything before it
            this.thinkAccumulator += text.substring(i, text.length - tailLen);
            this.tagBuffer = tail;
          } else {
            // Accumulate all remaining text as think content
            this.thinkAccumulator += text.substring(i);
          }
          break;
        }
      } else {
        const openIdx = text.indexOf('<think>', i);
        if (openIdx !== -1) {
          // Emit text before the tag as visible
          visibleText += text.substring(i, openIdx);
          this.insideThinkBlock = true;
          i = openIdx + '<think>'.length;
        } else {
          // Check for partial <think> at chunk boundary
          let partialMatch = false;
          for (let len = Math.min(7, text.length - i); len >= 1; len--) {
            const candidate = text.substring(text.length - len);
            if ('<think>'.startsWith(candidate)) {
              visibleText += text.substring(i, text.length - len);
              this.tagBuffer = candidate;
              partialMatch = true;
              break;
            }
          }
          if (!partialMatch) {
            visibleText += text.substring(i);
          }
          break;
        }
      }
    }

    return { visibleText, completedThink };
  }
}
