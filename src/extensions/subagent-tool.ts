import type { AgentProfile, ModelProvider, Tool } from "../shared/types.js";
import { AgentRuntime } from "../agent/runtime.js";
import { SubagentManager } from "./subagent-manager.js";
import { ToolRegistry } from "../tools/registry.js";

export function createRunSubagentTool(
  workspaceRoot: string,
  manager: SubagentManager,
  runtime: AgentRuntime,
  model: ModelProvider,
  profile: AgentProfile,
  toolRegistry: ToolRegistry,
): Tool<{
  agentName: string;
  task: string;
  context?: string;
  maxSteps?: number;
}> {
  return {
    name: "run_subagent",
    description: "Run a child subagent with isolated context and return its summary.",
    riskLevel: "medium",
    schema: {
      name: "run_subagent",
      description: "Run a child subagent with isolated context and return its summary.",
      inputSchema: {
        type: "object",
        properties: {
          agentName: { type: "string" },
          task: { type: "string" },
          context: { type: "string" },
          maxSteps: { type: "number" },
        },
        required: ["agentName", "task"],
      },
    },
    async execute(args, context) {
      const result = await manager.run(
        {
          parentSessionId: context.sessionId,
          agentName: args.agentName,
          task: args.task,
          ...(args.context === undefined ? {} : { context: args.context }),
          ...(args.maxSteps === undefined ? {} : { maxSteps: args.maxSteps }),
        },
        runtime,
        model,
        profile,
        toolRegistry,
      );
      return {
        success: result.success,
        output: result.summary,
        data: result,
      };
    },
  };
}
