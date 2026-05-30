import type { AgentMode, CapabilitySelectionTrigger, ToolSchema } from "@code-mind/shared";
import type { ToolRegistry } from "@code-mind/execution";
import type { RunState } from "./run-state.js";
import { getCollaborationToolSchemas } from "./plan-mode.js";

export type ToolSchemaSelectionTrigger = Extract<
  CapabilitySelectionTrigger,
  "runtime_mode" | "plan_mode" | "closing_turn"
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
  options: { enterClosingTurn: boolean },
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

  return {
    tools: getCollaborationToolSchemas(registry, runState),
    trigger: runState.planMode.active ? "plan_mode" : "runtime_mode",
    reason: runState.planMode.active
      ? "Tools selected for active collaboration plan mode."
      : "Tools selected for active runtime mode.",
    mode,
    planModeActive: runState.planMode.active,
  };
}
