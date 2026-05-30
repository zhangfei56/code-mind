import type { ToolCall, ToolContext, ToolResult } from "@code-mind/shared";
import { ToolRegistry } from "./tools/registry.js";

export class ToolExecutor {
  constructor(private readonly registry: ToolRegistry) {}

  async execute(
    toolCall: ToolCall,
    context: ToolContext,
  ): Promise<ToolResult> {
    return this.registry.execute(toolCall, context);
  }
}
