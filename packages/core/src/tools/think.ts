/**
 * Think tool — forces the model to reason before acting.
 *
 * A no-op tool that accepts structured reasoning and returns it back into
 * context. No side effects. The model calls it to plan before making changes.
 *
 * This is the single best compensator for weaker local models — research on
 * process reward models shows that models which checkpoint reasoning mid-task
 * make fewer cascading errors.
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolResult,
} from './tools.js';
import { FunctionDeclaration } from '@google/genai';

interface ThinkParams {
  reasoning: string;
}

const thinkToolSchemaData: FunctionDeclaration = {
  name: 'think',
  description:
    'Use this tool to plan your approach before taking action. Write out your reasoning about the problem, what files are involved, what changes are needed, and in what order. This helps you avoid mistakes by thinking before acting. The output is returned to you for reference — no side effects occur.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      reasoning: {
        type: 'string',
        description: 'Your structured reasoning about the current task.',
      },
    },
    required: ['reasoning'],
    $schema: 'http://json-schema.org/draft-07/schema#',
  },
};

// The invocation is trivially simple — return the reasoning back to the model.
// No file I/O, no side effects, no confirmation needed.
class ThinkToolInvocation extends BaseToolInvocation<ThinkParams, ToolResult> {
  getDescription(): string {
    const preview = this.params.reasoning.substring(0, 80);
    return preview.length < this.params.reasoning.length ? `${preview}...` : preview;
  }

  async execute(): Promise<ToolResult> {
    return {
      llmContent: [{ text: this.params.reasoning }],
      returnDisplay: this.params.reasoning,
    };
  }
}

export class ThinkTool extends BaseDeclarativeTool<ThinkParams, ToolResult> {
  static readonly Name: string = thinkToolSchemaData.name!;

  constructor() {
    super(
      ThinkTool.Name,
      'Think',
      thinkToolSchemaData.description!,
      Kind.Think,
      thinkToolSchemaData.parametersJsonSchema,
    );
  }

  protected createInvocation(params: ThinkParams) {
    return new ThinkToolInvocation(params);
  }
}
