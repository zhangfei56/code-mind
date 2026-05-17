import { mkdtempSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSessionStore } from "../../src/session/session-store.js";
import { createSessionRecord } from "../../src/session/session-record.js";
import type { AgentProfile, UserTask } from "../../src/shared/types.js";

export async function runSessionStoreTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-session-"));
  const store = new FileSessionStore(workspace);

  const task: UserTask = {
    id: "task_1",
    text: "修复测试失败",
    cwd: workspace,
    mode: "suggest",
    maxSteps: 10,
  };

  const profile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "You are a code agent.",
  };

  const session = await store.create(task, profile);
  await store.appendRecord(
    createSessionRecord(session.id, "user_message", { content: task.text }),
  );
  await store.saveSummary(session.id, "# Summary\n\nDone.");

  const messages = readFileSync(
    join(store.getSessionDir(session.id), "messages.jsonl"),
    "utf8",
  );
  const summary = readFileSync(
    join(store.getSessionDir(session.id), "summary.md"),
    "utf8",
  );

  assert.match(messages, /修复测试失败/);
  assert.match(summary, /Done\./);
}
