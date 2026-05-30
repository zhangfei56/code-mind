import type { ToolCall, ToolContext } from "@code-mind/shared";
import type { ToolExecutor } from "@code-mind/execution";
import type { ToolExecutionPort } from "../../kernel/ports.js";

export function createToolExecutionPort(toolExecutor: ToolExecutor): ToolExecutionPort {
  return {
    execute(toolCall: ToolCall, context: ToolContext) {
      return toolExecutor.execute(toolCall, context);
    },
  };
}
