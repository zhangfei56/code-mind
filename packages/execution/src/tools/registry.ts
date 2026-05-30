import type { AgentMode, ToolCall, ToolResult, ToolSchema, ToolContext, Tool } from "@code-mind/shared";
import { ValidationError } from "@code-mind/shared";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  getSchemas(): ToolSchema[] {
    return [...this.tools.values()].map((tool) => tool.schema);
  }

  getSchemasForMode(mode: AgentMode): ToolSchema[] {
    return [...this.tools.values()]
      .filter((tool) => this.isToolAvailableInMode(tool, mode))
      .map((tool) => tool.schema);
  }

  isToolAvailableInMode(tool: Tool, mode: AgentMode): boolean {
    if (!tool.availableInModes) {
      return mode === "edit" || mode === "agent";
    }
    return tool.availableInModes.includes(mode);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  async execute(
    toolCall: ToolCall,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.name);
    if (!tool) {
      return {
        success: false,
        output: "",
        error: `Unknown tool: ${toolCall.name}`,
      };
    }

    if (context.mode && !this.isToolAvailableInMode(tool, context.mode)) {
      return {
        success: false,
        output: "",
        error: `Tool "${toolCall.name}" is not available in ${context.mode} mode.`,
      };
    }

    try {
      return await tool.execute(toolCall.arguments, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool execution failed.";
      return {
        success: false,
        output: "",
        error: message,
        metadata: {
          kind: error instanceof ValidationError ? "validation_error" : "tool_error",
        },
      };
    }
  }
}
