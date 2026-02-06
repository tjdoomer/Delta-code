/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolResult,
} from './tools.js';
import { Config } from '../config/config.js';
import {
  SubAgentScope,
  ContextState,
  type PromptConfig,
  type ModelConfig,
  type RunConfig,
  type ToolConfig,
  type OutputConfig,
} from '../core/subagent.js';

export interface SubAgentToolParams {
  prompt: string;
  type: 'explore' | 'execute';
  tools?: string[];
}

const READ_ONLY_TOOLS = [
  'read_file',
  'list_directory',
  'search_files',
  'grep_search',
];

const subAgentToolDescription = `Launch a subagent to autonomously perform a task. Use "explore" type for read-only research tasks, or "execute" type for tasks that modify files.

The subagent runs with its own context and tools, and returns its findings or results.

## Parameters
- prompt: The task description for the subagent
- type: "explore" for read-only tasks, "execute" for tasks that modify files
- tools: Optional list of specific tool names to give the subagent (overrides type defaults)`;

class SubAgentToolInvocation extends BaseToolInvocation<
  SubAgentToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: SubAgentToolParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return `Running subagent (${this.params.type}): ${this.params.prompt.substring(0, 80)}...`;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const { prompt, type, tools: customTools } = this.params;

    // Determine tools based on type
    let toolNames: string[];
    if (customTools && customTools.length > 0) {
      toolNames = customTools;
    } else if (type === 'explore') {
      toolNames = READ_ONLY_TOOLS;
    } else {
      // execute mode: get all registered tool names
      const registry = await this.config.getToolRegistry();
      toolNames = registry.getAllTools().map((t) => t.name);
    }

    const promptConfig: PromptConfig = {
      systemPrompt: prompt,
    };

    const modelConfig: ModelConfig = {
      model: this.config.getModel(),
      temp: 0.2,
      top_p: 0.95,
    };

    const runConfig: RunConfig = {
      max_time_minutes: 5,
      max_turns: 20,
    };

    const toolConfig: ToolConfig = {
      tools: toolNames,
    };

    const outputConfig: OutputConfig = {
      outputs: {
        result: 'The result of the subagent task',
      },
    };

    try {
      const scope = await SubAgentScope.create(
        `subagent-${type}`,
        this.config,
        promptConfig,
        modelConfig,
        runConfig,
        toolConfig,
        outputConfig,
      );

      const context = new ContextState();
      await scope.runNonInteractive(context);

      const result =
        scope.output.emitted_vars['result'] ||
        JSON.stringify(scope.output.emitted_vars);

      return {
        llmContent: `Subagent completed (${scope.output.terminate_reason}):\n\n${result}`,
        returnDisplay: result.substring(0, 500),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Subagent failed: ${msg}`,
        returnDisplay: `Subagent failed: ${msg}`,
        error: {
          message: `Subagent execution failed: ${msg}`,
        },
      };
    }
  }
}

export class SubAgentTool extends BaseDeclarativeTool<
  SubAgentToolParams,
  ToolResult
> {
  static readonly Name: string = 'sub_agent';

  constructor(private readonly config: Config) {
    super(
      SubAgentTool.Name,
      'Sub Agent',
      subAgentToolDescription,
      Kind.Execute,
      {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The task description for the subagent to perform.',
          },
          type: {
            type: 'string',
            enum: ['explore', 'execute'],
            description:
              'The type of subagent: "explore" for read-only research, "execute" for tasks that modify files.',
          },
          tools: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Optional list of specific tool names to give the subagent. Overrides the default tools for the type.',
          },
        },
        required: ['prompt', 'type'],
        $schema: 'http://json-schema.org/draft-07/schema#',
      },
    );
  }

  protected createInvocation(params: SubAgentToolParams) {
    return new SubAgentToolInvocation(this.config, params);
  }
}
