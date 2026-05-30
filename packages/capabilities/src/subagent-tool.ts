import type { AgentProfile, ModelProvider, Tool } from "@code-mind/shared";
import { PLAN_TOOLS_MODES } from "@code-mind/shared";
import { SubagentManager } from "./subagent-manager.js";
import type { SubagentLoopHostFactory } from "./subagent-host-factory.js";
import { ToolRegistry } from "@code-mind/execution";

export function createRunSubagentTool(
  _workspaceRoot: string,
  manager: SubagentManager,
  hostFactory: SubagentLoopHostFactory,
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
    description:
      "Delegate a focused read-only sub-task to a child agent and receive a short summary. Main loop keeps ownership of patches and the final answer.",
    riskLevel: "low",
    availableInModes: PLAN_TOOLS_MODES,
    schema: {
      name: "run_subagent",
      description:
        "Spawn a child sub-agent with isolated context. Built-in: explore (read-only search, ~4 steps), plan (read-only design, ~5 steps). Use only for a specific sub-question—not for vague tasks like \"find bugs\". task must be verifiable (e.g. trace X from A to B).",
      inputSchema: {
        type: "object",
        properties: {
          agentName: {
            type: "string",
            description: "Sub-agent name: explore, plan, or a custom agent from .agent/agents.",
          },
          task: {
            type: "string",
            description:
              "One specific, verifiable sub-question for the child agent (not the whole user task).",
          },
          context: {
            type: "string",
            description: "Optional clues: paths, symbols, or conclusions from the main session.",
          },
          maxSteps: {
            type: "number",
            description: "Optional step budget; defaults to 4 (explore) or 5 (plan).",
          },
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
        hostFactory,
        model,
        profile,
        toolRegistry,
        context.mode,
      );
      return {
        success: result.success,
        output: result.summary,
        data: result,
      };
    },
  };
}
