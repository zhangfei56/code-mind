import type { UserTask } from "@code-mind/shared";
import type { PersistedRunStateV4, RunKernelPhase, StoredRunState } from "@code-mind/shared";
export type {
  PersistedRunState,
  PersistedRunStateV4,
  StoredRunState,
} from "@code-mind/shared";
import type { SessionStorePort } from "./ports/session-store-port.js";
import type { ExplorationEvidence } from "../task-strategy.js";
import {
  createRunKernelState,
  type RunKernelState,
} from "../kernel/index.js";
import type { RunState } from "./run-state.js";
import { createRunState } from "./run-state.js";

const RUN_KERNEL_PHASES = new Set<RunKernelPhase>([
  "initializing",
  "assembling_prompt",
  "calling_model",
  "routing_model_response",
  "handling_tools",
  "awaiting_approval",
  "executing_tool",
  "verifying",
  "recovering",
  "finalizing",
  "completed",
  "cancelled",
  "failed",
]);

function inferKernelState(input: {
  budget: RunState["budget"];
  progress: Pick<RunState["progress"], "lastCompletedStep" | "closingTurn">;
}): RunKernelState {
  return createRunKernelState({
    maxSteps: input.budget.baseMaxSteps + input.budget.extraStepBudget,
    step: input.progress.lastCompletedStep,
    closingTurn: input.progress.closingTurn,
  });
}

function sanitizeKernelStateForResume(state: RunKernelState): RunKernelState {
  if (
    state.phase === "completed" ||
    state.phase === "cancelled" ||
    state.phase === "failed"
  ) {
    return {
      ...state,
      phase: "recovering",
      pendingToolCalls: 0,
      checkpointRequired: true,
    };
  }

  const toolPhases = new Set<RunKernelPhase>([
    "handling_tools",
    "awaiting_approval",
    "executing_tool",
  ]);

  if (toolPhases.has(state.phase) && state.pendingToolCalls < 1) {
    return {
      ...state,
      phase: "assembling_prompt",
      pendingToolCalls: 0,
      checkpointRequired: true,
    };
  }

  if (state.pendingToolCalls > 0 && !toolPhases.has(state.phase)) {
    return {
      ...state,
      pendingToolCalls: 0,
      checkpointRequired: true,
    };
  }

  return state;
}

function normalizePersistedKernelState(
  kernel: unknown,
  fallback: RunKernelState,
): RunKernelState {
  if (typeof kernel !== "object" || kernel === null) {
    return sanitizeKernelStateForResume(fallback);
  }
  const candidate = kernel as Partial<Record<keyof RunKernelState, unknown>>;
  const maxSteps =
    Number.isInteger(candidate.maxSteps) && Number(candidate.maxSteps) > 0
      ? Number(candidate.maxSteps)
      : fallback.maxSteps;
  const step =
    Number.isInteger(candidate.step) &&
    Number(candidate.step) >= 0 &&
    Number(candidate.step) <= maxSteps
      ? Number(candidate.step)
      : Math.min(fallback.step, maxSteps);
  const phase =
    typeof candidate.phase === "string" && RUN_KERNEL_PHASES.has(candidate.phase as RunKernelPhase)
      ? candidate.phase as RunKernelPhase
      : fallback.phase;
  return sanitizeKernelStateForResume({
    phase,
    step,
    maxSteps,
    closingTurn:
      typeof candidate.closingTurn === "boolean"
        ? candidate.closingTurn
        : fallback.closingTurn,
    pendingToolCalls:
      Number.isInteger(candidate.pendingToolCalls) && Number(candidate.pendingToolCalls) >= 0
        ? Number(candidate.pendingToolCalls)
        : 0,
    checkpointRequired:
      typeof candidate.checkpointRequired === "boolean"
        ? candidate.checkpointRequired
        : fallback.checkpointRequired,
  });
}

export function normalizeKernelStateForResume(
  kernel: unknown,
  fallback: RunKernelState,
): RunKernelState {
  return normalizePersistedKernelState(kernel, fallback);
}

function applyManifestBudget(runState: RunState, effectiveMaxSteps: number | undefined): void {
  if (typeof effectiveMaxSteps !== "number") {
    return;
  }
  const extra = effectiveMaxSteps - runState.budget.baseMaxSteps;
  if (extra <= 0) {
    return;
  }
  runState.budget.extraStepBudget = extra;
  runState.kernel.maxSteps = effectiveMaxSteps;
}

export function serializeRunState(runState: RunState): PersistedRunStateV4 {
  return {
    version: 4,
    kernel: { ...runState.kernel },
    progress: {
      mode: runState.progress.mode,
      modifiedFiles: [...runState.progress.modifiedFiles],
      lastCompletedStep: runState.progress.lastCompletedStep,
      closingTurn: runState.progress.closingTurn,
      toolCounts: { ...runState.progress.toolCounts },
      ...(runState.progress.lastTool === undefined ? {} : { lastTool: runState.progress.lastTool }),
      ...(runState.progress.lastActivity === undefined
        ? {}
        : { lastActivity: runState.progress.lastActivity }),
    },
    planMode: { ...runState.planMode },
    exploration: { evidence: { ...runState.exploration.evidence } },
    verification: {
      ...(runState.verification.lastVerification === undefined
        ? {}
        : { lastVerification: runState.verification.lastVerification }),
      recoveryAttempts: runState.verification.recoveryAttempts,
    },
    review: {
      ...(runState.review.lastReview === undefined
        ? {}
        : { lastReview: runState.review.lastReview }),
      recoveryAttempts: runState.review.recoveryAttempts,
    },
    budget: { ...runState.budget },
    usage: { ...runState.usage },
  };
}

function deserializeV4(task: UserTask, data: PersistedRunStateV4): RunState {
  const runState = createRunState(task);
  runState.progress = {
    mode: data.progress.mode,
    modifiedFiles: new Set(data.progress.modifiedFiles),
    lastCompletedStep: data.progress.lastCompletedStep,
    closingTurn: data.progress.closingTurn,
    toolCounts: { ...data.progress.toolCounts },
    ...(data.progress.lastTool === undefined ? {} : { lastTool: data.progress.lastTool }),
    ...(data.progress.lastActivity === undefined
      ? {}
      : { lastActivity: data.progress.lastActivity }),
  };
  runState.planMode = { ...data.planMode };
  runState.exploration = { evidence: { ...data.exploration.evidence } };
  runState.verification = {
    ...(data.verification.lastVerification === undefined
      ? {}
      : { lastVerification: data.verification.lastVerification }),
    recoveryAttempts: data.verification.recoveryAttempts,
  };
  runState.review = {
    ...(data.review?.lastReview === undefined ? {} : { lastReview: data.review.lastReview }),
    recoveryAttempts: data.review?.recoveryAttempts ?? 0,
  };
  runState.budget = { ...data.budget };
  runState.usage = { ...data.usage };
  runState.kernel = normalizePersistedKernelState(
    data.kernel,
    inferKernelState(runState),
  );
  return runState;
}

export function deserializeRunState(task: UserTask, data: StoredRunState): RunState {
  if (data.version !== 4) {
    throw new Error(`Unsupported persisted run-state version: ${String((data as { version?: unknown }).version)}`);
  }
  return deserializeV4(task, data);
}

export async function restoreRunStateForSession(
  sessionStore: SessionStorePort,
  sessionId: string,
  task: UserTask,
): Promise<RunState> {
  const persisted = await sessionStore.readRunState(sessionId);
  if (persisted) {
    const runState = deserializeRunState(task, persisted);
    try {
      const manifest = await sessionStore.readManifest(sessionId);
      applyManifestBudget(runState, manifest.effectiveMaxSteps);
    } catch {
      // Manifest may be missing on corrupted sessions; keep persisted budget.
    }
    return runState;
  }

  const runState = createRunState(task);
  const verification = await sessionStore.readVerification(sessionId);
  if (verification) {
    runState.verification.lastVerification = verification;
  }

  try {
    const manifest = await sessionStore.readManifest(sessionId);
    if (typeof manifest.effectiveMaxSteps === "number") {
      applyManifestBudget(runState, manifest.effectiveMaxSteps);
    }
  } catch {
    // Manifest may be missing on corrupted sessions; keep defaults.
  }

  return runState;
}
