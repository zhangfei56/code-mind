import type { AgentSession, RunFactsSnapshot, RuntimeInput } from "@code-mind/shared";
import type { RunState } from "./run-state.js";

export function toRunFactsSnapshot(
  input: RuntimeInput,
  session: AgentSession,
  runState: RunState,
): RunFactsSnapshot {
  return {
    mode: runState.planMode.active ? "plan" : runState.progress.mode,
    atWorkspaceRoot: input.task.cwd === session.workspaceRoot,
  };
}
