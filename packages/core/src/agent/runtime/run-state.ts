import {
  addTokenUsage as mergeTokenUsage,
  createEmptyTokenUsage as sharedCreateEmptyTokenUsage,
  createEmptyToolActivityCounts,
  readRequestedMaxSteps,
} from "@code-mind/shared";
import type {
  AgentMode,
  ReviewResult,
  TokenUsage,
  ToolActivityCounts,
  UserTask,
  VerificationResult,
} from "@code-mind/shared";
export { readRequestedMaxSteps } from "@code-mind/shared";
import {
  createRunKernelState,
  type RunKernelState,
} from "../kernel/index.js";
import type { ExplorationEvidence } from "../task-strategy.js";
import { createEmptyExplorationEvidence } from "../task-strategy.js";

export interface PlanModeState {
  active: boolean;
  preMode?: AgentMode;
  /** Workspace-relative path to the plan draft file. */
  draftRelativePath?: string;
  approved?: boolean;
}

export function createEmptyPlanModeState(): PlanModeState {
  return { active: false };
}

/** Edit progress and tool activity tracked across the run loop. */
export interface ProgressState {
  mode: AgentMode;
  modifiedFiles: Set<string>;
  lastCompletedStep: number;
  closingTurn: boolean;
  toolCounts: ToolActivityCounts;
  lastTool?: { name: string; at: string };
  lastActivity?: import("@code-mind/shared").ActivityKind;
  /** Last model call prompt size (input tokens) for CLI status/footer. */
  lastContextTokens?: number;
  /** Model window size paired with lastContextTokens. */
  lastMaxContextTokens?: number;
}

/** Exploration signals gathered from read/list/grep tool calls. */
export interface ExplorationState {
  evidence: ExplorationEvidence;
}

/** Verification outcome and recovery budget consumed. */
export interface VerificationState {
  lastVerification?: VerificationResult;
  recoveryAttempts: number;
}

/** Post-edit review outcome and recovery budget consumed. */
export interface ReviewState {
  lastReview?: ReviewResult;
  recoveryAttempts: number;
}

/** Step budget: requested, base, and recovery extras. */
export interface StepBudgetState {
  requestedMaxSteps: number;
  baseMaxSteps: number;
  extraStepBudget: number;
}

/** Cumulative token usage across model calls in a run. */
export interface TokenUsageState {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface RunState {
  kernel: RunKernelState;
  progress: ProgressState;
  exploration: ExplorationState;
  verification: VerificationState;
  review: ReviewState;
  budget: StepBudgetState;
  usage: TokenUsageState;
  planMode: PlanModeState;
}

export function createEmptyTokenUsage(): TokenUsageState {
  return sharedCreateEmptyTokenUsage();
}

export function addTokenUsage(state: TokenUsageState, usage: TokenUsage): void {
  mergeTokenUsage(state, usage);
}

export function createRunState(task: UserTask): RunState {
  return {
    kernel: createRunKernelState({ maxSteps: task.maxSteps }),
    progress: {
      mode: task.mode,
      modifiedFiles: new Set<string>(),
      lastCompletedStep: 0,
      closingTurn: false,
      toolCounts: createEmptyToolActivityCounts(),
    },
    exploration: {
      evidence: createEmptyExplorationEvidence(),
    },
    verification: {
      recoveryAttempts: 0,
    },
    review: {
      recoveryAttempts: 0,
    },
    budget: {
      requestedMaxSteps: readRequestedMaxSteps(task),
      baseMaxSteps: task.maxSteps,
      extraStepBudget: 0,
    },
    usage: createEmptyTokenUsage(),
    planMode: createEmptyPlanModeState(),
  };
}

export function getEffectiveMaxSteps(runState: RunState): number {
  return runState.budget.baseMaxSteps + runState.budget.extraStepBudget;
}

export function hasExplorationProgress(runState: RunState): boolean {
  const { evidence } = runState.exploration;
  return (
    evidence.projectRootConfirmed ||
    evidence.entryFileRead ||
    evidence.candidateFileLocated ||
    evidence.verificationCommandKnown
  );
}

export function isReadOnlyRun(runState: RunState): boolean {
  return runState.progress.modifiedFiles.size === 0;
}
