import type { AgentMode, AgentResult, AgentResultStatus } from "@code-mind/shared";

export interface BenchmarkSetupFile {
  path: string;
  content: string;
}

export interface BenchmarkGraders {
  verifyCommand?: string;
  verifyExitCode?: number;
  fileContains?: Array<{ path: string; pattern: string }>;
  fileNotContains?: Array<{ path: string; pattern: string }>;
  maxSteps?: number;
  maxToolCalls?: number;
  requiredEvents?: string[];
  forbiddenEvents?: string[];
  expectStatus?: AgentResultStatus | "any";
  forbiddenCompletion?: string[];
  requireVerificationPassed?: boolean;
}

export interface PolyglotRef {
  language: "python" | "javascript" | "go" | "rust" | "java" | "cpp";
  exercise: string;
}

export interface SwebenchRef {
  instanceId: string;
  repo: string;
  baseCommit: string;
  version?: string;
}

export interface BenchmarkCase {
  id: string;
  tier?: "micro" | "product" | "external";
  category?: string;
  mode: AgentMode;
  workspace: string;
  prompt: string;
  goal: string;
  maxSteps?: number;
  setupFiles?: BenchmarkSetupFile[];
  prepareCommand?: string;
  polyglot?: PolyglotRef;
  swebench?: SwebenchRef;
  /** Relative to benchmarks/cases/product/ */
  productCase?: string;
  graders?: BenchmarkGraders;
  tags?: string[];
  source?: string;
}

export interface GraderCheck {
  id: string;
  passed: boolean;
  message: string;
}

export interface CaseGrade {
  passed: boolean;
  score: number;
  checks: GraderCheck[];
}

export interface EvalCaseResult {
  id: string;
  workspace: string;
  prompt: string;
  goal: string;
  status: AgentResult["status"];
  steps: number;
  completion?: string;
  summary: string;
  sessionId: string;
  runId: string;
  grade: CaseGrade;
}

export interface EvalRunReport {
  runId: string;
  workload: string;
  model: string;
  gitCommit?: string;
  maxStepsDefault: number;
  createdAt: string;
  total: number;
  resolved: number;
  resolvedRate: number;
  averageSteps: number;
  statusStats: Record<string, number>;
  completionStats: Record<string, number>;
  failureReasonStats: Record<string, number>;
  results: EvalCaseResult[];
}

export interface EvalCompareDelta {
  baselineRunId: string;
  currentRunId: string;
  baselineResolvedRate: number;
  currentResolvedRate: number;
  resolvedRateDelta: number;
  regressions: string[];
  improvements: string[];
  unchanged: string[];
}
