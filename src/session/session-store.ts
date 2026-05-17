import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentProfile, AgentSession, SessionRecord, UserTask } from "../shared/types.js";
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

    return session;
  }

  async appendRecord(record: SessionRecord): Promise<void> {
    const filePath = this.getRecordFilePath(record.sessionId, record.type);
    await mkdir(this.getSessionDir(record.sessionId), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
  }

  async saveSummary(sessionId: string, summary: string): Promise<void> {
    const summaryPath = join(this.getSessionDir(sessionId), "summary.md");
    await mkdir(this.getSessionDir(sessionId), { recursive: true });
    await writeSummary(summaryPath, summary);
  }

  getSessionDir(sessionId: string): string {
    return join(this.workspaceRoot, ".agent", "sessions", sessionId);
  }

  getPatchesDir(sessionId: string): string {
    return join(this.getSessionDir(sessionId), "patches");
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
}
