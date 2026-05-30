import type { AgentMode, UserTask, AgentEvent } from "@code-mind/shared";
import { logProcess } from "@code-mind/shared";
import type { AgentLoopController } from "./runtime/agent-loop-controller.js";
import type { PlanApprovalHandler } from "./plan-approval.js";
import {
  PLAN_FIRST_EXECUTION_MODES,
  executeFromApprovedPlan,
  runPlanFirstSession,
} from "./plan-session-orchestrator.js";
import {
  prepareTask,
  resolveReturnedTask,
  runAgentLoopOnce,
} from "./session-orchestration.js";
import { applyRecommendedMaxSteps } from "./task-strategy.js";

export type { ExecuteFromApprovedPlanInput } from "./plan-session-orchestrator.js";
export { executeFromApprovedPlan } from "./plan-session-orchestrator.js";

export interface RunAgentSessionInput {
  task: UserTask;
  profile: import("@code-mind/shared").AgentProfile;
  model: import("@code-mind/shared").ModelProvider;
  loop: AgentLoopController;
  workspaceRoot: string;
  sessionRoot?: string;
  planFirst?: boolean;
  /** When true and no approvePlan handler, auto-approve plan before execution. */
  autoApprovePlan?: boolean;
  useWorktree?: boolean;
  approvePlan?: PlanApprovalHandler;
  resumeSessionId?: string;
  abortSignal?: AbortSignal;
  onStatusChange?: (
    status: import("@code-mind/shared").SessionStatus,
  ) => void | Promise<void>;
  onEvent?: (event: AgentEvent) => void | Promise<void>;
}

export interface RunAgentSessionResult {
  task: UserTask;
  result: import("@code-mind/shared").AgentResult;
  planResult?: import("@code-mind/shared").AgentResult;
}

const COMPONENT = "core.run-session";

export async function runAgentSession(
  input: RunAgentSessionInput,
): Promise<RunAgentSessionResult> {
  const loop = input.loop;
  if (!loop) {
    throw new Error("runAgentSession requires loop (AgentLoopController).");
  }

  const executionMode = input.task.mode;
  logProcess(COMPONENT, "debug", "Starting runAgentSession.", {
    mode: executionMode,
    cwd: input.task.cwd,
    planFirst: input.planFirst === true,
    useWorktree: input.useWorktree === true,
    resumeSessionId: input.resumeSessionId,
  });

  // --- Prepare execution context (worktree, session root) ---
  const prepared = await prepareTask(
    applyRecommendedMaxSteps(input.task, input.workspaceRoot),
    input.workspaceRoot,
    input.useWorktree,
  );
  const sessionRoot = input.sessionRoot ?? prepared.sessionRoot;

  const shouldPlanFirst =
    input.planFirst === true && PLAN_FIRST_EXECUTION_MODES.has(executionMode);
  logProcess(COMPONENT, "debug", "Prepared session task.", {
    workspaceRoot: input.workspaceRoot,
    sessionRoot,
    preparedCwd: prepared.task.cwd,
    shouldPlanFirst,
  });

  const runtimeHooks = {
    ...(input.abortSignal === undefined ? {} : { abortSignal: input.abortSignal }),
    ...(input.onStatusChange === undefined
      ? {}
      : { onStatusChange: input.onStatusChange }),
    ...(input.onEvent === undefined ? {} : { onEvent: input.onEvent }),
    ...(input.approvePlan === undefined ? {} : { approvePlan: input.approvePlan }),
    ...(input.autoApprovePlan === undefined ? {} : { autoApprovePlan: input.autoApprovePlan }),
  };

  if (shouldPlanFirst) {
    // --- Plan-first path: planning → approval → execution ---
    logProcess(COMPONENT, "debug", "Routing through plan-first session orchestration.");
    return runPlanFirstSession({
      ...input,
      preparedTask: prepared.task,
      executionMode,
      ...(sessionRoot === undefined ? {} : { sessionRoot }),
    });
  }

  const result = await runAgentLoopOnce(loop, {
    task: prepared.task,
    profile: input.profile,
    model: input.model,
    ...(input.resumeSessionId === undefined
      ? {}
      : { resumeSessionId: input.resumeSessionId }),
    ...(sessionRoot === undefined ? {} : { sessionRoot }),
    ...runtimeHooks,
  });

  return {
    task: await resolveReturnedTask(input.workspaceRoot, result.sessionId, prepared.task),
    result,
  };
}
