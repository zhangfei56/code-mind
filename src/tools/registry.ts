import type { Tool, ToolCall, ToolResult, ToolSchema, ToolContext } from "../shared/types.js";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  getSchemas(): ToolSchema[] {
    return [...this.tools.values()].map((tool) => tool.schema);
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

    return tool.execute(toolCall.arguments, context);
  }
}
