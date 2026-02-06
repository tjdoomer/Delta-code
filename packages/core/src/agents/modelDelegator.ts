/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { ResourceProbe, ModelEndpoint } from './resourceProbe.js';
import { TaskPlanner, MicroTask } from './taskPlanner.js';
import {
  SubAgentScope,
  ContextState,
  type PromptConfig,
  type ModelConfig,
  type RunConfig,
  type ToolConfig,
  type OutputConfig,
} from '../core/subagent.js';

/**
 * Routes tasks to the cheapest sufficient model from available endpoints.
 * Falls back to the main model on failure.
 */
export class ModelDelegator {
  constructor(
    private config: Config,
    private probe: ResourceProbe,
    private planner: TaskPlanner,
  ) {}

  /**
   * Delegates a micro task to the most appropriate model.
   * Returns the result string from the subagent.
   */
  async delegate(task: MicroTask): Promise<string> {
    const endpoints = await this.probe.probe();
    const delegation = this.config.getDelegation();
    const preferLocal = delegation?.preferLocal ?? true;

    // Find the cheapest sufficient model
    const selectedModel = this.selectModel(
      endpoints,
      task.tier,
      preferLocal,
    );

    if (!selectedModel) {
      // Fall back to main model
      return this.executeWithModel(this.config.getModel(), task);
    }

    try {
      return await this.executeWithModel(selectedModel.name, task);
    } catch {
      // Fall back to main model on failure
      return this.executeWithModel(this.config.getModel(), task);
    }
  }

  /**
   * Classifies and delegates a task description.
   */
  async classifyAndDelegate(description: string): Promise<string> {
    const task = this.planner.classifyTask(description);
    return this.delegate(task);
  }

  private selectModel(
    endpoints: ModelEndpoint[],
    requiredTier: 'fast' | 'medium' | 'strong',
    preferLocal: boolean,
  ): ModelEndpoint | null {
    const available = endpoints.filter((e) => e.available);
    if (available.length === 0) return null;

    const tierOrder: Record<string, number> = {
      fast: 0,
      medium: 1,
      strong: 2,
    };
    const requiredLevel = tierOrder[requiredTier];

    // Filter to sufficient models (tier >= required)
    const sufficient = available.filter(
      (e) => tierOrder[e.tier] >= requiredLevel,
    );

    if (sufficient.length === 0) {
      // No model meets the tier, return the strongest available
      return available.reduce((a, b) =>
        tierOrder[a.tier] > tierOrder[b.tier] ? a : b,
      );
    }

    // Sort by cheapness: prefer local if configured, then by lowest sufficient tier
    sufficient.sort((a, b) => {
      // Prefer local models if configured
      if (preferLocal) {
        if (a.type === 'local' && b.type !== 'local') return -1;
        if (a.type !== 'local' && b.type === 'local') return 1;
      }
      // Then by tier (lowest sufficient first = cheapest)
      return tierOrder[a.tier] - tierOrder[b.tier];
    });

    return sufficient[0];
  }

  private async executeWithModel(
    modelName: string,
    task: MicroTask,
  ): Promise<string> {
    const promptConfig: PromptConfig = {
      systemPrompt: task.prompt,
    };

    const modelConfig: ModelConfig = {
      model: modelName,
      temp: 0.2,
      top_p: 0.95,
    };

    const runConfig: RunConfig = {
      max_time_minutes: 5,
      max_turns: 15,
    };

    const toolConfig: ToolConfig = {
      tools: task.tools,
    };

    const outputConfig: OutputConfig = {
      outputs: {
        result: 'The result of the task',
      },
    };

    const scope = await SubAgentScope.create(
      `delegate-${modelName}`,
      this.config,
      promptConfig,
      modelConfig,
      runConfig,
      toolConfig,
      outputConfig,
    );

    const context = new ContextState();
    await scope.runNonInteractive(context);

    return (
      scope.output.emitted_vars['result'] ||
      JSON.stringify(scope.output.emitted_vars)
    );
  }
}
