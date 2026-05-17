import { mkdir, appendFile, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AgentProfile,
  AgentPlan,
  AgentSession,
  InternalMessage,
  Observation,
  AuditRecord,
  PermissionDecisionRecord,
  ReviewResult,
  SessionManifest,
  SessionRecord,
  TaskState,
  TestResult,
  ToolCall,
  UserTask,
  VerificationResult,
  WorktreeInfo,
} from "../shared/types.js";
import { createId } from "../shared/ids.js";
import { nowIso } from "../shared/time.js";
import { writeSummary } from "./summary-writer.js";

export class FileSessionStore {
  constructor(private readonly workspaceRoot: string) {}

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
    await mkdir(this.getPatchesDir(sessionId), { recursive: true });
    await mkdir(this.getDiffsDir(sessionId), { recursive: true });
    await this.writeManifest({
      id: sessionId,
      projectPath: this.workspaceRoot,
      task: task.text,
      mode: task.mode,
      model: task.requestedModel ?? "unconfigured",
      status: "running",
      createdAt: timestamp,
      updatedAt: timestamp,
      maxSteps: task.maxSteps,
    });

    return session;
  }

  async appendRecord(record: SessionRecord): Promise<void> {
    const filePath = this.getRecordFilePath(record.sessionId, record.type);
    await mkdir(this.getSessionDir(record.sessionId), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
  }

  async appendModelCall(
    sessionId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await mkdir(this.getSessionDir(sessionId), { recursive: true });
    await appendFile(
      join(this.getSessionDir(sessionId), "model-calls.jsonl"),
      `${JSON.stringify({
        sessionId,
        createdAt: nowIso(),
        payload,
      })}\n`,
      "utf8",
    );
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

  async saveTaskState(sessionId: string, state: TaskState): Promise<void> {
    await mkdir(this.getSessionDir(sessionId), { recursive: true });
    await writeFile(
      join(this.getSessionDir(sessionId), "task-state.json"),
      `${JSON.stringify(state, null, 2)}\n`,
      "utf8",
    );
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

  async appendRecoveryEvent(
    sessionId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await mkdir(this.getSessionDir(sessionId), { recursive: true });
    await appendFile(
      join(this.getSessionDir(sessionId), "recovery-events.jsonl"),
      `${JSON.stringify({
        sessionId,
        createdAt: nowIso(),
        payload,
      })}\n`,
      "utf8",
    );
  }

  async appendPermissionDecision(
    record: PermissionDecisionRecord,
  ): Promise<void> {
    await mkdir(this.getSessionDir(record.sessionId), { recursive: true });
    await appendFile(
      join(this.getSessionDir(record.sessionId), "permission-decisions.jsonl"),
      `${JSON.stringify(record)}\n`,
      "utf8",
    );
  }

  async appendAuditRecord(record: AuditRecord): Promise<void> {
    await mkdir(this.getSessionDir(record.sessionId), { recursive: true });
    await appendFile(
      join(this.getSessionDir(record.sessionId), "audit.jsonl"),
      `${JSON.stringify(record)}\n`,
      "utf8",
    );
  }

  getSessionDir(sessionId: string): string {
    return join(this.workspaceRoot, ".agent", "sessions", sessionId);
  }

  getPatchesDir(sessionId: string): string {
    return join(this.getSessionDir(sessionId), "patches");
  }

  getDiffsDir(sessionId: string): string {
    return join(this.getSessionDir(sessionId), "diffs");
  }

  getCompactDir(sessionId: string): string {
    return join(this.getSessionDir(sessionId), "compact");
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
    const current = await this.readManifest(sessionId);
    const next = {
      ...current,
      ...updates,
      updatedAt: nowIso(),
    } satisfies SessionManifest;
    await this.writeManifest(next);
    return next;
  }

  async readManifest(sessionId: string): Promise<SessionManifest> {
    const manifestPath = join(this.getSessionDir(sessionId), "session.json");
    const content = await readFile(manifestPath, "utf8");
    return JSON.parse(content) as SessionManifest;
  }

  async listSessionManifests(): Promise<SessionManifest[]> {
    const sessionsRoot = join(this.workspaceRoot, ".agent", "sessions");
    let entries: string[] = [];
    try {
      entries = await readdir(sessionsRoot);
    } catch {
      return [];
    }

    const manifests = await Promise.all(
      entries.map(async (sessionId) => {
        try {
          return await this.readManifest(sessionId);
        } catch {
          return null;
        }
      }),
    );

    return manifests
      .filter((value): value is SessionManifest => value !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async restoreSession(
    sessionId: string,
    profile: AgentProfile,
  ): Promise<AgentSession> {
    const manifest = await this.readManifest(sessionId);
    const messageRecords = await this.readJsonLines<SessionRecord>(
      join(this.getSessionDir(sessionId), "messages.jsonl"),
    );
    const toolCallRecords = await this.readJsonLines<SessionRecord>(
      join(this.getSessionDir(sessionId), "tool-calls.jsonl"),
    );
    const toolResultRecords = await this.readJsonLines<SessionRecord>(
      join(this.getSessionDir(sessionId), "tool-results.jsonl"),
    );
    const compactFiles = await readdir(this.getCompactDir(sessionId)).catch(() => []);
    const compactSummaries = await Promise.all(
      compactFiles
        .filter((file) => file.endsWith(".md"))
        .sort()
        .map((file) => readFile(join(this.getCompactDir(sessionId), file), "utf8")),
    );

    const toolCallsById = new Map<string, ToolCall>();
    const messages: InternalMessage[] = [];
    const observations: Observation[] = [];
    const events = [...messageRecords, ...toolCallRecords, ...toolResultRecords].sort(
      (left, right) => left.createdAt.localeCompare(right.createdAt),
    );

    for (const record of events) {
      switch (record.type) {
        case "user_message":
          messages.push({
            id: createId("msg"),
            role: "user",
            content: String(record.payload.content ?? ""),
            createdAt: record.createdAt,
          });
          break;
        case "assistant_message":
          messages.push({
            id: createId("msg"),
            role: "assistant",
            content: String(record.payload.content ?? ""),
            createdAt: record.createdAt,
          });
          break;
        case "tool_call": {
          const toolCall: ToolCall = {
            id: String(record.payload.id ?? createId("call")),
            name: String(record.payload.name ?? "unknown"),
            arguments:
              typeof record.payload.arguments === "object" &&
              record.payload.arguments !== null
                ? (record.payload.arguments as Record<string, unknown>)
                : {},
          };
          toolCallsById.set(toolCall.id, toolCall);
          const lastMessage = messages[messages.length - 1];
          if (lastMessage?.role === "assistant") {
            lastMessage.toolCalls = [...(lastMessage.toolCalls ?? []), toolCall];
          } else {
            messages.push({
              id: createId("msg"),
              role: "assistant",
              content: "",
              createdAt: record.createdAt,
              toolCalls: [toolCall],
            });
          }
          break;
        }
        case "tool_result": {
          const toolCallId = String(record.payload.toolCallId ?? "");
          const toolCall = toolCallsById.get(toolCallId) ?? {
            id: toolCallId || createId("call"),
            name: "unknown",
            arguments: {},
          };
          const success = Boolean(record.payload.success);
          const output = success
            ? String(record.payload.output ?? "")
            : `ERROR: ${String(record.payload.error ?? record.payload.output ?? "")}`;
          messages.push({
            id: createId("msg"),
            role: "tool",
            content: output,
            createdAt: record.createdAt,
            toolCallId: toolCall.id,
            name: toolCall.name,
          });
          observations.push({
            toolCall,
            toolResult: {
              success,
              output: String(record.payload.output ?? ""),
              ...(record.payload.error === undefined
                ? {}
                : { error: String(record.payload.error) }),
            },
            createdAt: record.createdAt,
          });
          break;
        }
      }
    }

    const compactionSummary =
      compactSummaries.length > 0 ? compactSummaries.join("\n\n") : undefined;

    const task: UserTask = {
      id: createId("task"),
      text: manifest.task,
      cwd: manifest.projectPath,
      mode: manifest.mode,
      maxSteps: manifest.maxSteps ?? 10,
      requestedModel: manifest.model,
    };

    return {
      id: sessionId,
      task,
      workspaceRoot: manifest.projectPath,
      profile,
      modelName: manifest.model,
      messages,
      observations,
      createdAt: manifest.createdAt,
      updatedAt: manifest.updatedAt,
      metadata: {
        restored: true,
        ...(compactionSummary === undefined ? {} : { compactionSummary }),
        ...(compactSummaries.length === 0
          ? {}
          : { compactionCount: compactSummaries.length }),
      },
    };
  }

  private getRecordFilePath(
    sessionId: string,
    type: SessionRecord["type"],
  ): string {
    switch (type) {
      case "user_message":
      case "assistant_message":
        return join(this.getSessionDir(sessionId), "messages.jsonl");
      case "tool_call":
        return join(this.getSessionDir(sessionId), "tool-calls.jsonl");
      case "tool_result":
        return join(this.getSessionDir(sessionId), "tool-results.jsonl");
      case "patch":
      case "summary":
      case "event":
        return join(this.getSessionDir(sessionId), "events.jsonl");
    }
  }

  private async writeManifest(manifest: SessionManifest): Promise<void> {
    await mkdir(this.getSessionDir(manifest.id), { recursive: true });
    await writeFile(
      join(this.getSessionDir(manifest.id), "session.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  }

  private async readJsonLines<T>(filePath: string): Promise<T[]> {
    try {
      const content = await readFile(filePath, "utf8");
      return content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as T);
    } catch {
      return [];
    }
  }
}
