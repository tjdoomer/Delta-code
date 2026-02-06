/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import type { PRD, Story } from './prdParser.js';
import { ProgressTracker } from './progressTracker.js';
import {
  SubAgentScope,
  ContextState,
  type PromptConfig,
  type ModelConfig,
  type RunConfig,
  type ToolConfig,
  type OutputConfig,
} from '../core/subagent.js';

const MAX_FAILURES_PER_STORY = 3;

export class AgentLoop {
  constructor(
    private config: Config,
    private prd: PRD,
    private tracker: ProgressTracker,
  ) {}

  async run(signal: AbortSignal): Promise<void> {
    for (const story of this.prd.stories) {
      if (signal.aborted) break;
      if (story.status === 'done' || story.status === 'failed') continue;

      story.status = 'in_progress';
      await this.tracker.updateState(this.prd);
      await this.tracker.appendProgress(
        story.id,
        `Starting: ${story.title}`,
      );

      const success = await this.executeStory(story, signal);

      story.status = success ? 'done' : 'failed';
      await this.tracker.updateState(this.prd);
      await this.tracker.appendProgress(
        story.id,
        `${success ? 'Completed' : 'Failed'}: ${story.title}`,
      );
    }
  }

  private async executeStory(
    story: Story,
    signal: AbortSignal,
  ): Promise<boolean> {
    let failures = 0;

    while (failures < MAX_FAILURES_PER_STORY) {
      if (signal.aborted) return false;

      try {
        const progress = await this.tracker.getProgress();

        const prompt = this.buildStoryPrompt(story, progress);

        const promptConfig: PromptConfig = {
          systemPrompt: prompt,
        };

        const modelConfig: ModelConfig = {
          model: this.config.getModel(),
          temp: 0.2,
          top_p: 0.95,
        };

        const runConfig: RunConfig = {
          max_time_minutes: 10,
          max_turns: 30,
        };

        // Get all available tool names for the subagent
        const registry = await this.config.getToolRegistry();
        const toolNames = registry.getAllTools().map((t) => t.name);

        const toolConfig: ToolConfig = {
          tools: toolNames,
        };

        const outputConfig: OutputConfig = {
          outputs: {
            result: 'Description of what was accomplished',
            status: 'Whether the story was completed: success or failure',
          },
        };

        const scope = await SubAgentScope.create(
          `loop-${story.id}`,
          this.config,
          promptConfig,
          modelConfig,
          runConfig,
          toolConfig,
          outputConfig,
        );

        const context = new ContextState();
        await scope.runNonInteractive(context);

        const status = scope.output.emitted_vars['status'] || '';
        const result = scope.output.emitted_vars['result'] || '';

        await this.tracker.appendProgress(
          story.id,
          `Attempt result: ${status} — ${result.substring(0, 200)}`,
        );

        if (
          status.toLowerCase().includes('success') ||
          status.toLowerCase().includes('done')
        ) {
          return true;
        }

        failures++;
      } catch (error) {
        failures++;
        const msg =
          error instanceof Error ? error.message : String(error);
        await this.tracker.appendProgress(
          story.id,
          `Error (attempt ${failures}): ${msg}`,
        );
      }
    }

    return false;
  }

  private buildStoryPrompt(story: Story, progress: string): string {
    let prompt = `You are working on a project: "${this.prd.title}"\n\n`;
    prompt += `## Current Story: ${story.title}\n\n`;
    prompt += `### Acceptance Criteria:\n`;
    for (const criterion of story.criteria) {
      prompt += `- ${criterion}\n`;
    }
    prompt += '\n';

    if (progress) {
      prompt += `### Progress from previous stories:\n${progress}\n\n`;
    }

    prompt += `Complete all acceptance criteria for this story. Use the available tools to read, modify, and create files as needed. When done, emit a "result" describing what was accomplished and "status" as "success" or "failure".`;

    return prompt;
  }

  getStatus(): {
    total: number;
    completed: number;
    failed: number;
    current: string | null;
  } {
    const total = this.prd.stories.length;
    const completed = this.prd.stories.filter((s) => s.status === 'done').length;
    const failed = this.prd.stories.filter(
      (s) => s.status === 'failed',
    ).length;
    const currentStory = this.prd.stories.find(
      (s) => s.status === 'in_progress',
    );
    return {
      total,
      completed,
      failed,
      current: currentStory?.title ?? null,
    };
  }
}
