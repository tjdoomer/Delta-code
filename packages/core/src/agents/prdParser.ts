/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Story {
  id: string;
  title: string;
  criteria: string[];
  status: 'pending' | 'in_progress' | 'done' | 'failed';
}

export interface PRD {
  title: string;
  stories: Story[];
}

/**
 * Parses a PRD document from markdown or JSON format.
 *
 * Markdown format:
 * ```
 * # Project Title
 *
 * ## Story: Story Title
 * - [ ] Criterion 1
 * - [ ] Criterion 2
 *
 * ## Story: Another Story
 * - [ ] Criterion 3
 * ```
 *
 * JSON format: Direct PRD object with title and stories array.
 */
export function parsePRD(content: string): PRD {
  const trimmed = content.trim();

  // Try JSON first
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed);
      if (json.title && Array.isArray(json.stories)) {
        return json as PRD;
      }
    } catch {
      // Not valid JSON, fall through to markdown parsing
    }
  }

  return parseMarkdownPRD(trimmed);
}

function parseMarkdownPRD(content: string): PRD {
  const lines = content.split('\n');

  let title = 'Untitled PRD';
  const stories: Story[] = [];
  let currentStory: Story | null = null;
  let storyCounter = 0;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Parse title from H1
    const h1Match = trimmedLine.match(/^#\s+(.+)$/);
    if (h1Match) {
      title = h1Match[1].trim();
      continue;
    }

    // Parse story headers from H2
    const h2Match = trimmedLine.match(/^##\s+(?:Story:\s*)?(.+)$/);
    if (h2Match) {
      if (currentStory) {
        stories.push(currentStory);
      }
      storyCounter++;
      currentStory = {
        id: `story-${storyCounter}`,
        title: h2Match[1].trim(),
        criteria: [],
        status: 'pending',
      };
      continue;
    }

    // Parse criteria from checkbox items
    const checkboxMatch = trimmedLine.match(
      /^-\s+\[([xX\s])\]\s+(.+)$/,
    );
    if (checkboxMatch && currentStory) {
      currentStory.criteria.push(checkboxMatch[2].trim());
      if (checkboxMatch[1].toLowerCase() === 'x') {
        // Pre-checked items mean the story is already done
        // (only if all items are checked, but we track individually)
      }
      continue;
    }

    // Parse plain list items as criteria
    const listMatch = trimmedLine.match(/^-\s+(.+)$/);
    if (listMatch && currentStory) {
      currentStory.criteria.push(listMatch[1].trim());
    }
  }

  if (currentStory) {
    stories.push(currentStory);
  }

  return { title, stories };
}
