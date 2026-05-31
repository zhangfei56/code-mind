import { mkdtempSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSessionStore } from "@code-mind/session";
import type { AgentProfile, UserTask } from "@code-mind/shared";

export async function runSessionStoreTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-session-"));
  const store = new FileSessionStore(workspace);

  const task: UserTask = {
    id: "task_1",
    text: "修复测试失败",
    cwd: workspace,
    mode: "edit",
    maxSteps: 10,
  };

  const profile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "You are a code agent.",
  };

  const session = await store.create(task, profile);

  await store.saveSummary(session.id, "# Summary\n\nDone.");
  await store.saveCurrentSummary(session.id, "# Current Summary\n\nWorking.");
  await store.saveApproval({
    id: "approval_1",
    sessionId: session.id,
    toolCallId: "call_1",
    toolName: "apply_patch",
    reason: "Patch requires approval.",
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  await store.updateManifest(session.id, {
    model: "local",
    status: "success",
    completion: "modified_verified",
  });

  const summary = readFileSync(
    join(store.getSessionDir(session.id), "summary.md"),
    "utf8",
  );
  const currentSummary = readFileSync(
    join(store.getSessionDir(session.id), "current-summary.md"),
    "utf8",
  );
  const manifest = readFileSync(
    join(store.getSessionDir(session.id), "session.json"),
    "utf8",
  );
  const approvals = readFileSync(
    join(store.getSessionDir(session.id), "approvals.json"),
    "utf8",
  );

  assert.match(summary, /Done\./);
  assert.match(currentSummary, /Working\./);
  assert.match(manifest, /"status": "success"/);
  assert.match(manifest, /"model": "local"/);
  assert.match(manifest, /"completion": "modified_verified"/);
  assert.match(approvals, /"status": "pending"/);

  await store.recordCompaction(session.id, {
    ts: "2026-05-31T08:00:00.000Z",
    step: 2,
    compactionCount: 1,
    strategy: "llm",
    retainedMessages: 8,
    retainedObservations: 4,
    evictedMessages: 12,
    evictedObservations: 6,
    durationMs: 420,
    path: "compact/compact-001.md",
    model: "deepseek",
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  });

  const ledger = readFileSync(
    join(store.getSessionDir(session.id), "compaction-ledger.jsonl"),
    "utf8",
  );
  assert.match(ledger, /"strategy":"llm"/);
  assert.match(ledger, /"evictedMessages":12/);
}
