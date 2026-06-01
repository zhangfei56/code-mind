import type { AgentMode, CapabilitySelectionTrigger, ToolSchema } from "@code-mind/shared";
import type { ToolRegistry } from "@code-mind/execution";
import type { UserTask } from "@code-mind/shared";
import type { RunState } from "./run-state.js";
import { getCollaborationToolSchemas } from "./plan-mode.js";
import { FILE_MUTATION_TOOL_NAMES } from "../task-clarity.js";
import { shouldGateFileMutations } from "../task-strategy.js";

export type ToolSchemaSelectionTrigger = Extract<
  CapabilitySelectionTrigger,
  "runtime_mode" | "plan_mode" | "closing_turn" | "exploration_gate"
>;

export interface ToolSchemaSelection {
  tools: ToolSchema[];
  trigger: ToolSchemaSelectionTrigger;
  reason: string;
  mode: AgentMode;
  planModeActive: boolean;
}

export function selectToolSchemasForModel(
  registry: ToolRegistry,
  runState: RunState,
  options: {
    enterClosingTurn: boolean;
    task: UserTask;
    workspaceRoot: string;
    strategy: import("../task-strategy.js").LoopPolicy;
  },
): ToolSchemaSelection {
  const mode = runState.planMode.active ? "plan" : runState.progress.mode;
  if (options.enterClosingTurn) {
    return {
      tools: [],
      trigger: "closing_turn",
      reason: "Closing turn disables tool schemas.",
      mode,
      planModeActive: runState.planMode.active,
    };
  }

  let tools = getCollaborationToolSchemas(registry, runState);
  const gateWrites = shouldGateFileMutations({
    task: options.task,
    workspaceRoot: options.workspaceRoot,
    policy: options.strategy,
    evidence: runState.exploration.evidence,
    modifiedFilesCount: runState.progress.modifiedFiles.size,
  });

  if (gateWrites) {
    tools = tools.filter((schema) => !FILE_MUTATION_TOOL_NAMES.has(schema.name));
    return {
      tools,
      trigger: "exploration_gate",
      reason:
        "File mutation tools gated until exploration evidence is sufficient (scope control).",
      mode,
      planModeActive: runState.planMode.active,
    };
  }

  return {
    tools,
    trigger: runState.planMode.active ? "plan_mode" : "runtime_mode",
    reason: runState.planMode.active
      ? "Tools selected for active collaboration plan mode."
      : "Tools selected for active runtime mode.",
    mode,
    planModeActive: runState.planMode.active,
  };
}
