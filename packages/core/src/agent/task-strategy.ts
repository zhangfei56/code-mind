import type { AgentMode, UserTask } from "@code-mind/shared";
import type { ExplorationEvidence } from "@code-mind/shared";
export type { ExplorationEvidence } from "@code-mind/shared";
export { createEmptyExplorationEvidence } from "@code-mind/shared";

export interface LoopPolicy {
  mode: AgentMode;
  explorationBudget: number;
  reserveSummaryStep: boolean;
  autoVerifyAfterPatch: boolean;
  /** Maximum verification-failure recovery cycles (hint + extra steps). */
  maxRecoveryAttempts: number;
  forceNarrowingAfterBudget: boolean;
}

export function isBroadRepoRootTask(
  task: UserTask,
  workspaceRoot: string,
): boolean {
  return task.cwd === workspaceRoot;
}

export function recommendMaxSteps(
  task: UserTask,
  workspaceRoot: string,
): number {
  return isBroadRepoRootTask(task, workspaceRoot)
    ? Math.max(task.maxSteps, 12)
    : task.maxSteps;
}

/** Preserve the requested limit in metadata, then apply recommendMaxSteps. */
export function applyRecommendedMaxSteps(
  task: UserTask,
  workspaceRoot: string,
): UserTask {
  const requestedMaxSteps = task.maxSteps;
  return {
    ...task,
    maxSteps: recommendMaxSteps(task, workspaceRoot),
    metadata: {
      ...task.metadata,
      requestedMaxSteps,
    },
  };
}

export function hasEnoughExplorationEvidence(
  evidence: ExplorationEvidence,
  policy: LoopPolicy,
): boolean {
  if (policy.mode === "ask" || policy.mode === "plan") {
    return (
      evidence.projectRootConfirmed &&
      (evidence.entryFileRead || evidence.candidateFileLocated)
    );
  }

  return (
    evidence.projectRootConfirmed &&
    evidence.candidateFileLocated &&
    evidence.verificationCommandKnown
  );
}

const MODE_PROFILES: Record<
  AgentMode,
  Omit<LoopPolicy, "mode">
> = {
  ask: {
    explorationBudget: 3,
    reserveSummaryStep: true,
    autoVerifyAfterPatch: false,
    maxRecoveryAttempts: 0,
    forceNarrowingAfterBudget: true,
  },
  plan: {
    explorationBudget: 3,
    reserveSummaryStep: true,
    autoVerifyAfterPatch: false,
    maxRecoveryAttempts: 0,
    forceNarrowingAfterBudget: true,
  },
  edit: {
    explorationBudget: 4,
    reserveSummaryStep: true,
    autoVerifyAfterPatch: true,
    maxRecoveryAttempts: 2,
    forceNarrowingAfterBudget: false,
  },
  agent: {
    explorationBudget: 4,
    reserveSummaryStep: true,
    autoVerifyAfterPatch: true,
    maxRecoveryAttempts: 2,
    forceNarrowingAfterBudget: false,
  },
};

export function createLoopPolicy(task: UserTask): LoopPolicy {
  const profile = MODE_PROFILES[task.mode];
  const cappedExplore = Math.max(2, Math.min(4, Math.floor(task.maxSteps * 0.4)));

  return {
    mode: task.mode,
    ...profile,
    explorationBudget:
      task.mode === "ask" || task.mode === "plan"
        ? cappedExplore
        : Math.max(profile.explorationBudget, cappedExplore),
  };
}

export function shouldEnterClosingTurn(params: {
  policy: LoopPolicy;
  step: number;
  maxSteps: number;
  modifiedFilesCount: number;
  hasVerificationResult: boolean;
  verificationFailed?: boolean;
  evidence: ExplorationEvidence;
}): boolean {
  const {
    policy,
    step,
    maxSteps,
    modifiedFilesCount,
    hasVerificationResult,
    verificationFailed = false,
    evidence,
  } = params;

  if (step >= maxSteps) {
    return true;
  }

  if (policy.reserveSummaryStep && step === maxSteps - 1) {
    if (modifiedFilesCount === 0) {
      return true;
    }
    if (verificationFailed) {
      return false;
    }
    if (policy.autoVerifyAfterPatch && !hasVerificationResult) {
      return false;
    }
    return true;
  }

  if (
    (policy.mode === "ask" || policy.mode === "plan") &&
    modifiedFilesCount === 0 &&
    (step >= policy.explorationBudget || hasEnoughExplorationEvidence(evidence, policy))
  ) {
    return true;
  }

  return false;
}
