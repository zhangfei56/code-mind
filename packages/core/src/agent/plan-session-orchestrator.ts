import type {
  AgentMode,
  AgentProfile,
  AgentResult,
  ModelProvider,
  SessionManifest,
  UserTask,
} from "@code-mind/shared";
import { ValidationError, createId, nowIso } from "@code-mind/shared";
import { createOrchestrationSessionStore } from "./runtime/ports/session-store-port.js";
import { AgentLoopController } from "./runtime/agent-loop-controller.js";
import type { PlanApprovalHandler } from "./plan-approval.js";
import { isAgentRunSuccessful } from "./result-status.js";
import {
  buildExecuteTask,
  linkPlanAndExecuteSessions,
  prepareTask,
  resolveReturnedTask,
  runAgentLoopOnce,
} from "./session-orchestration.js";
import type { RunAgentSessionInput, RunAgentSessionResult } from "./run-session.js";

const PLAN_FIRST_EXECUTION_MODES = new Set<AgentMode>(["edit", "agent"]);

export interface ExecuteFromApprovedPlanInput {
  planSessionId: string;
  executionMode?: AgentMode;
  loop: AgentLoopController;
  profile: AgentProfile;
  model: ModelProvider;
  workspaceRoot: string;
  sessionRoot?: string;
  useWorktree?: boolean;
  maxSteps?: number;
  abortSignal?: AbortSignal;
  onStatusChange?: RunAgentSessionInput["onStatusChange"];
  onEvent?: RunAgentSessionInput["onEvent"];
}

function manifestToPlanResult(
  planSessionId: string,
  planManifest: SessionManifest,
  planText: string,
): AgentResult {
  return {
    sessionId: planSessionId,
    runId: planManifest.id,
    status:
      planManifest.status === "failed"
        ? "failed"
        : planManifest.status === "cancelled"
          ? "cancelled"
          : "success",
    finalText: planText,
    steps: 0,
    modelName: planManifest.model,
  };
}

export async function executeFromApprovedPlan(
  input: ExecuteFromApprovedPlanInput,
): Promise<RunAgentSessionResult> {
  const store = createOrchestrationSessionStore(input.workspaceRoot);
  const planManifest = await store.readManifest(input.planSessionId);

  const isPlanSession =
    planManifest.sessionRole === "plan" ||
    (planManifest.mode === "plan" && planManifest.sessionRole !== "execute");
  if (!isPlanSession) {
    throw new ValidationError(
      `Session ${input.planSessionId} is not a plan session.`,
    );
  }
  if (planManifest.executeSessionId) {
    throw new ValidationError(
      `Plan session ${input.planSessionId} already has execute session ${planManifest.executeSessionId}.`,
    );
  }
  if (planManifest.status === "running") {
    throw new ValidationError(
      `Plan session ${input.planSessionId} is still running.`,
    );
  }

  const planArtifact = await store.readPlan(input.planSessionId);
  const planText = planArtifact?.markdown?.trim();
  if (!planText) {
    throw new ValidationError(
      `No approved plan found for session ${input.planSessionId}.`,
    );
  }

  const executionMode = input.executionMode ?? "edit";
  if (!PLAN_FIRST_EXECUTION_MODES.has(executionMode)) {
    throw new ValidationError(
      `Invalid execution mode: ${executionMode}. Expected edit or agent.`,
    );
  }

  const baseTask: UserTask = {
    id: createId("task"),
    text: planManifest.task,
    cwd: planManifest.executionCwd ?? input.workspaceRoot,
    mode: executionMode,
    maxSteps: input.maxSteps ?? planManifest.maxSteps ?? 10,
    metadata: {
      createdAt: nowIso(),
      executeFromPlan: input.planSessionId,
      ...(planManifest.requestedMaxSteps === undefined
        ? {}
        : { requestedMaxSteps: planManifest.requestedMaxSteps }),
    },
    ...(planManifest.model === "unconfigured"
      ? {}
      : { requestedModel: planManifest.model }),
  };

  const prepared = await prepareTask(
    baseTask,
    input.workspaceRoot,
    input.useWorktree,
  );
  const sessionRoot =
    input.sessionRoot ?? prepared.sessionRoot ?? planManifest.projectPath;

  const runtimeHooks = {
    ...(input.abortSignal === undefined ? {} : { abortSignal: input.abortSignal }),
    ...(input.onStatusChange === undefined
      ? {}
      : { onStatusChange: input.onStatusChange }),
    ...(input.onEvent === undefined ? {} : { onEvent: input.onEvent }),
  };

  const executeTask = buildExecuteTask(prepared.task, executionMode, planText);
  const result = await runAgentLoopOnce(input.loop, {
    task: executeTask,
    profile: input.profile,
    model: input.model,
    sessionRoot,
    ...runtimeHooks,
  });

  await linkPlanAndExecuteSessions(
    input.workspaceRoot,
    input.planSessionId,
    result.sessionId,
  );

  const planResult = manifestToPlanResult(
    input.planSessionId,
    planManifest,
    planText,
  );

  return {
    task: await resolveReturnedTask(input.workspaceRoot, result.sessionId, executeTask),
    result,
    planResult,
  };
}

export async function runPlanFirstSession(
  input: RunAgentSessionInput & {
    preparedTask: UserTask;
    executionMode: AgentMode;
    sessionRoot?: string;
  },
): Promise<RunAgentSessionResult> {
  const runtimeHooks = {
    ...(input.abortSignal === undefined ? {} : { abortSignal: input.abortSignal }),
    ...(input.onStatusChange === undefined
      ? {}
      : { onStatusChange: input.onStatusChange }),
    ...(input.onEvent === undefined ? {} : { onEvent: input.onEvent }),
  };

  // --- Phase 1: planning ---
  const planTask: UserTask = { ...input.preparedTask, mode: "plan" };
  const planResult = await runAgentLoopOnce(input.loop, {
    task: planTask,
    profile: input.profile,
    model: input.model,
    ...(input.sessionRoot === undefined ? {} : { sessionRoot: input.sessionRoot }),
    ...runtimeHooks,
  });

  if (!isAgentRunSuccessful(planResult)) {
    return { task: planTask, result: planResult, planResult };
  }

  // --- Phase 2: plan approval ---
  const planApproved = input.approvePlan
    ? await input.approvePlan({
        planSessionId: planResult.sessionId,
        planText: planResult.finalText,
      })
    : input.autoApprovePlan === true;
  if (!planApproved) {
    await createOrchestrationSessionStore(input.workspaceRoot).updateManifest(planResult.sessionId, {
      sessionRole: "plan",
      status: "permission_denied",
    });
    return {
      task: planTask,
      result: {
        ...planResult,
        status: "permission_denied",
        finalText: `${planResult.finalText}\n\nPlan was not approved.`,
        summary: "Plan requires explicit approval before execution.",
      },
      planResult,
    };
  }

  // --- Phase 3: execution ---
  const executeTask = buildExecuteTask(
    input.preparedTask,
    input.executionMode,
    planResult.finalText,
  );
  const result = await runAgentLoopOnce(input.loop, {
    task: executeTask,
    profile: input.profile,
    model: input.model,
    ...(input.sessionRoot === undefined ? {} : { sessionRoot: input.sessionRoot }),
    ...runtimeHooks,
  });

  await linkPlanAndExecuteSessions(
    input.workspaceRoot,
    planResult.sessionId,
    result.sessionId,
  );

  return {
    task: await resolveReturnedTask(input.workspaceRoot, result.sessionId, executeTask),
    result,
    planResult,
  };
}

export { PLAN_FIRST_EXECUTION_MODES };
