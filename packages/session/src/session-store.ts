import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getCompactDir as getWorkspaceCompactDir,
  getDiffsDir as getWorkspaceDiffsDir,
  getPatchesDir as getWorkspacePatchesDir,
  getSessionDir as getWorkspaceSessionDir,
} from "@code-mind/workspace";
import type {
  AgentProfile,
  AgentPlan,
  AgentSession,
  ApprovalRecord,
  ModelUsageRecord,
  ReviewResult,
  SessionManifest,
  TestResult,
  UserTask,
  VerificationResult,
  WorktreeInfo,
} from "@code-mind/shared";
import { createId, nowIso, readRequestedMaxSteps } from "@code-mind/shared";
import type { PersistedRunState, StoredRunState } from "@code-mind/shared";
import { SessionManifestStore } from "./session-manifest.js";
import { restoreAgentSession } from "./session-restore.js";
import { writeSummary } from "./summary-writer.js";
import {
  appendModelUsageRecord,
  buildUsageSummaryFromRun,
  buildUsageSummaryUpdate,
} from "./usage-ledger.js";

export class FileSessionStore {
  private readonly manifests: SessionManifestStore;

  constructor(readonly workspaceRoot: string) {
    this.manifests = new SessionManifestStore(workspaceRoot);
  }

  async create(task: UserTask, profile: AgentProfile): Promise<AgentSession> {
    const sessionId = createId("session");
    const timestamp = nowIso();
    const session = {
      id: sessionId,
      task,
      workspaceRoot: this.workspaceRoot,
      profile,
      modelName: task.requestedModel ?? "unconfigured",
      messages: [],
      observations: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    } satisfies AgentSession;

    await mkdir(this.getSessionDir(sessionId), { recursive: true });
    await mkdir(getWorkspacePatchesDir(this.workspaceRoot, sessionId), { recursive: true });
    await mkdir(getWorkspaceDiffsDir(this.workspaceRoot, sessionId), { recursive: true });
    await this.manifests.write({
      id: sessionId,
      projectPath: this.workspaceRoot,
      executionCwd: task.cwd,
      task: task.text,
      mode: task.mode,
      model: task.requestedModel ?? "unconfigured",
      status: "running",
      createdAt: timestamp,
      updatedAt: timestamp,
      maxSteps: task.maxSteps,
      requestedMaxSteps: readRequestedMaxSteps(task),
      sessionRole: "standard",
    });

    return session;
  }

  async saveSummary(sessionId: string, summary: string): Promise<void> {
    const summaryPath = join(this.getSessionDir(sessionId), "summary.md");
    await mkdir(this.getSessionDir(sessionId), { recursive: true });
    await writeSummary(summaryPath, summary);
  }

  async saveCurrentSummary(sessionId: string, summary: string): Promise<void> {
    const summaryPath = join(this.getSessionDir(sessionId), "current-summary.md");
    await mkdir(this.getSessionDir(sessionId), { recursive: true });
    await writeSummary(summaryPath, summary);
  }

  async savePlan(sessionId: string, plan: AgentPlan, markdown: string): Promise<void> {
    await mkdir(this.getSessionDir(sessionId), { recursive: true });
    await writeFile(
      join(this.getSessionDir(sessionId), "plan.json"),
      `${JSON.stringify(plan, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(this.getSessionDir(sessionId), "plan.md"),
      markdown,
      "utf8",
    );
  }

  async writeSessionTextFile(
    sessionId: string,
    fileName: string,
    content: string,
  ): Promise<void> {
    await mkdir(this.getSessionDir(sessionId), { recursive: true });
    await writeFile(join(this.getSessionDir(sessionId), fileName), content, "utf8");
  }

  async readPlan(
    sessionId: string,
  ): Promise<{ plan: AgentPlan; markdown: string } | undefined> {
    try {
      const [planRaw, markdown] = await Promise.all([
        readFile(join(this.getSessionDir(sessionId), "plan.json"), "utf8"),
        readFile(join(this.getSessionDir(sessionId), "plan.md"), "utf8"),
      ]);
      return {
        plan: JSON.parse(planRaw) as AgentPlan,
        markdown,
      };
    } catch {
      return undefined;
    }
  }

  async saveVerification(
    sessionId: string,
    verification: VerificationResult,
  ): Promise<void> {
    await mkdir(this.getSessionDir(sessionId), { recursive: true });
    await writeFile(
      join(this.getSessionDir(sessionId), "verification.json"),
      `${JSON.stringify(verification, null, 2)}\n`,
      "utf8",
    );
  }

  async readVerification(sessionId: string): Promise<VerificationResult | undefined> {
    const filePath = join(this.getSessionDir(sessionId), "verification.json");
    try {
      const content = await readFile(filePath, "utf8");
      return JSON.parse(content) as VerificationResult;
    } catch {
      return undefined;
    }
  }

  async saveRunState(sessionId: string, runState: PersistedRunState): Promise<void> {
    await mkdir(this.getSessionDir(sessionId), { recursive: true });
    await writeFile(
      join(this.getSessionDir(sessionId), "run-state.json"),
      `${JSON.stringify(runState, null, 2)}\n`,
      "utf8",
    );
  }

  async readRunState(sessionId: string): Promise<StoredRunState | undefined> {
    const filePath = join(this.getSessionDir(sessionId), "run-state.json");
    try {
      const content = await readFile(filePath, "utf8");
      const parsed = JSON.parse(content) as StoredRunState;
      return parsed?.version === 4 ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  async saveReview(sessionId: string, review: ReviewResult): Promise<void> {
    await mkdir(this.getSessionDir(sessionId), { recursive: true });
    await writeFile(
      join(this.getSessionDir(sessionId), "review.json"),
      `${JSON.stringify(review, null, 2)}\n`,
      "utf8",
    );
  }

  async saveWorktree(sessionId: string, worktree: WorktreeInfo): Promise<void> {
    await mkdir(this.getSessionDir(sessionId), { recursive: true });
    await writeFile(
      join(this.getSessionDir(sessionId), "worktree.json"),
      `${JSON.stringify(worktree, null, 2)}\n`,
      "utf8",
    );
  }

  async readWorktree(sessionId: string): Promise<WorktreeInfo | undefined> {
    const filePath = join(this.getSessionDir(sessionId), "worktree.json");
    try {
      const content = await readFile(filePath, "utf8");
      return JSON.parse(content) as WorktreeInfo;
    } catch {
      return undefined;
    }
  }

  async saveDiagnostics(
    sessionId: string,
    diagnostics: unknown,
  ): Promise<void> {
    const diagnosticsDir = join(this.getSessionDir(sessionId), "lsp");
    await mkdir(diagnosticsDir, { recursive: true });
    await writeFile(
      join(diagnosticsDir, "diagnostics.json"),
      `${JSON.stringify(diagnostics, null, 2)}\n`,
      "utf8",
    );
  }

  async saveTestResult(
    sessionId: string,
    testResult: TestResult,
  ): Promise<void> {
    const testResultsDir = join(this.getSessionDir(sessionId), "test-results");
    await mkdir(testResultsDir, { recursive: true });
    const existing = await readdir(testResultsDir).catch(() => []);
    const nextIndex = existing.filter((file) => file.endsWith(".json")).length + 1;
    await writeFile(
      join(testResultsDir, `test-${String(nextIndex).padStart(3, "0")}.json`),
      `${JSON.stringify(testResult, null, 2)}\n`,
      "utf8",
    );
  }

  async saveApproval(record: ApprovalRecord): Promise<void> {
    const approvals = await this.listApprovals(record.sessionId);
    const next = approvals.filter((item) => item.id !== record.id);
    next.push(record);
    next.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    await mkdir(this.getSessionDir(record.sessionId), { recursive: true });
    await writeFile(
      join(this.getSessionDir(record.sessionId), "approvals.json"),
      `${JSON.stringify(next, null, 2)}\n`,
      "utf8",
    );
  }

  async listApprovals(sessionId: string): Promise<ApprovalRecord[]> {
    const filePath = join(this.getSessionDir(sessionId), "approvals.json");
    try {
      const content = await readFile(filePath, "utf8");
      const parsed = JSON.parse(content) as ApprovalRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async getPendingApprovals(sessionId: string): Promise<ApprovalRecord[]> {
    const approvals = await this.listApprovals(sessionId);
    return approvals.filter((item) => item.status === "pending");
  }

  getSessionDir(sessionId: string): string {
    return getWorkspaceSessionDir(this.workspaceRoot, sessionId);
  }

  getPatchesDir(sessionId: string): string {
    return getWorkspacePatchesDir(this.workspaceRoot, sessionId);
  }

  getDiffsDir(sessionId: string): string {
    return getWorkspaceDiffsDir(this.workspaceRoot, sessionId);
  }

  getCompactDir(sessionId: string): string {
    return getWorkspaceCompactDir(this.workspaceRoot, sessionId);
  }

  async saveCompactSummary(
    sessionId: string,
    summary: string,
  ): Promise<string> {
    const compactDir = this.getCompactDir(sessionId);
    await mkdir(compactDir, { recursive: true });
    const existing = await readdir(compactDir).catch(() => []);
    const nextIndex = existing.filter((file) => file.endsWith(".md")).length + 1;
    const filePath = join(
      compactDir,
      `compact-${String(nextIndex).padStart(3, "0")}.md`,
    );
    await writeFile(filePath, summary, "utf8");
    return filePath;
  }

  async updateManifest(
    sessionId: string,
    updates: Partial<Omit<SessionManifest, "id" | "createdAt">>,
  ): Promise<SessionManifest> {
    return this.manifests.update(sessionId, updates);
  }

  async readManifest(sessionId: string): Promise<SessionManifest> {
    return this.manifests.read(sessionId);
  }

  async listSessionManifests(): Promise<SessionManifest[]> {
    return this.manifests.list();
  }

  async recordModelUsage(sessionId: string, record: ModelUsageRecord): Promise<SessionManifest> {
    const sessionDir = this.getSessionDir(sessionId);
    await appendModelUsageRecord(sessionDir, record);
    const manifest = await this.readManifest(sessionId);
    const usageSummary = buildUsageSummaryUpdate(manifest, record);
    return this.updateManifest(sessionId, { usageSummary });
  }

  async mergeRunUsageSummary(
    sessionId: string,
    usage: ModelUsageRecord["usage"],
    modelCalls: number,
  ): Promise<SessionManifest> {
    const manifest = await this.readManifest(sessionId);
    const usageSummary = buildUsageSummaryFromRun(manifest, usage, modelCalls);
    return this.updateManifest(sessionId, { usageSummary });
  }

  async restoreSession(
    sessionId: string,
    profile: AgentProfile,
  ): Promise<AgentSession> {
    const manifest = await this.readManifest(sessionId);
    return restoreAgentSession({
      workspaceRoot: this.workspaceRoot,
      sessionId,
      manifest,
      profile,
      getCompactDir: (id) => this.getCompactDir(id),
      readWorktree: (id) => this.readWorktree(id),
    });
  }
}
