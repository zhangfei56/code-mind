import type { AgentSession, RunFactsSnapshot, RuntimeInput } from "@code-mind/shared";
import type { RunState } from "./run-state.js";
import { needsScopeControl } from "../task-clarity.js";

export function toRunFactsSnapshot(
  input: RuntimeInput,
  session: AgentSession,
  runState: RunState,
): RunFactsSnapshot {
  const scopeControlActive = needsScopeControl(input.task, session.workspaceRoot);
  return {
    mode: runState.planMode.active ? "plan" : runState.progress.mode,
    atWorkspaceRoot: input.task.cwd === session.workspaceRoot,
    ...(scopeControlActive ? { scopeControlActive: true } : {}),
  };
}
