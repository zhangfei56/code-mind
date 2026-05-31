import type { AgentSession, RunFactsSnapshot, RuntimeInput } from "@code-mind/shared";
import type { RunState } from "./run-state.js";
import { getEffectiveMaxSteps } from "./run-state.js";

export function toRunFactsSnapshot(
  input: RuntimeInput,
  session: AgentSession,
  runState: RunState,
): RunFactsSnapshot {
  const mode = runState.planMode.active ? "plan" : runState.progress.mode;

  return {
    mode,
    step: runState.progress.lastCompletedStep,
    maxSteps: getEffectiveMaxSteps(runState),
    closingTurn: runState.progress.closingTurn,
    modifiedFiles: [...runState.progress.modifiedFiles],
    ...(runState.progress.lastTool === undefined
      ? {}
      : { lastTool: runState.progress.lastTool }),
    ...(runState.progress.lastActivity === undefined
      ? {}
      : { lastActivity: runState.progress.lastActivity }),
    toolCounts: { ...runState.progress.toolCounts },
    ...(runState.verification.lastVerification === undefined
      ? {}
      : { lastVerification: runState.verification.lastVerification }),
    atWorkspaceRoot: input.task.cwd === session.workspaceRoot,
    planModeActive: runState.planMode.active,
  };
}
