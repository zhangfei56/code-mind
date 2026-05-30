import type { ActivityKind, AgentMode, ReviewResult, ToolActivityCounts, VerificationResult } from "./types.js";
import type { ExplorationEvidence } from "./exploration-evidence.js";
import type { RunKernelState } from "./run-kernel-state.js";

export interface PlanModeStateSnapshot {
  active: boolean;
  preMode?: AgentMode;
  draftRelativePath?: string;
  approved?: boolean;
}

export interface StepBudgetStateSnapshot {
  requestedMaxSteps: number;
  baseMaxSteps: number;
  extraStepBudget: number;
}

export interface TokenUsageStateSnapshot {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface PersistedRunStateV4 {
  version: 4;
  kernel: RunKernelState;
  progress: {
    mode: AgentMode;
    modifiedFiles: string[];
    lastCompletedStep: number;
    closingTurn: boolean;
    toolCounts: ToolActivityCounts;
    lastTool?: { name: string; at: string };
    lastActivity?: ActivityKind;
  };
  planMode: PlanModeStateSnapshot;
  exploration: { evidence: ExplorationEvidence };
  verification: {
    lastVerification?: VerificationResult;
    recoveryAttempts: number;
  };
  review?: {
    lastReview?: ReviewResult;
    recoveryAttempts: number;
  };
  budget: StepBudgetStateSnapshot;
  usage: TokenUsageStateSnapshot;
}

export type StoredRunState = PersistedRunStateV4;

export type PersistedRunState = PersistedRunStateV4;
