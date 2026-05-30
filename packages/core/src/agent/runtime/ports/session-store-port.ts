import type {
  AgentPlan,
  AgentProfile,
  AgentSession,
  ApprovalRecord,
  ReviewResult,
  SessionManifest,
  UserTask,
  VerificationResult,
  WorktreeInfo,
} from "@code-mind/shared";
import type { PersistedRunState, StoredRunState } from "@code-mind/shared";
import { FileSessionStore } from "@code-mind/session";

/** Core runtime boundary for session persistence (implementation: `@code-mind/session`). */
export interface SessionStorePort {
  create(task: UserTask, profile: AgentProfile): Promise<AgentSession>;
  restoreSession(sessionId: string, profile: AgentProfile): Promise<AgentSession>;
  updateManifest(
    sessionId: string,
    updates: Partial<Omit<SessionManifest, "id" | "createdAt">>,
  ): Promise<SessionManifest>;
  readManifest(sessionId: string): Promise<SessionManifest>;
  saveCurrentSummary(sessionId: string, summary: string): Promise<void>;
  saveSummary(sessionId: string, summary: string): Promise<void>;
  savePlan(sessionId: string, plan: AgentPlan, markdown: string): Promise<void>;
  writeSessionTextFile(sessionId: string, fileName: string, content: string): Promise<void>;
  readPlan(sessionId: string): Promise<{ plan: AgentPlan; markdown: string } | undefined>;
  saveCompactSummary(sessionId: string, summary: string): Promise<string>;
  saveReview(sessionId: string, review: ReviewResult): Promise<void>;
  saveVerification(sessionId: string, verification: VerificationResult): Promise<void>;
  readVerification(sessionId: string): Promise<VerificationResult | undefined>;
  saveRunState(sessionId: string, runState: PersistedRunState): Promise<void>;
  readRunState(sessionId: string): Promise<StoredRunState | undefined>;
  saveWorktree(sessionId: string, worktree: WorktreeInfo): Promise<void>;
  readWorktree(sessionId: string): Promise<WorktreeInfo | undefined>;
  listSessionManifests(): Promise<SessionManifest[]>;
  saveApproval(record: ApprovalRecord): Promise<void>;
  listApprovals(sessionId: string): Promise<ApprovalRecord[]>;
  getPendingApprovals(sessionId: string): Promise<ApprovalRecord[]>;
  /** Session directory for apps orchestration (export/fork); implementation: `@code-mind/session`. */
  getSessionDir(sessionId: string): string;
}

export function createSessionStorePort(store: FileSessionStore): SessionStorePort {
  return store;
}

/** L2 orchestration entry (plan-first, session linking) — not used inside step loop. */
export function createOrchestrationSessionStore(workspaceRoot: string): SessionStorePort {
  return createSessionStorePort(new FileSessionStore(workspaceRoot));
}
