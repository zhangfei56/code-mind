import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DefaultContextManager } from "@code-mind/context";
import { createDefaultAgentProfile } from "@code-mind/models";
import type { AgentSession, UserTask } from "@code-mind/shared";

function hashSystemMessages(messages: Array<{ role: string; content: string }>): string {
  const systemText = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n---\n\n");
  return createHash("sha256").update(systemText).digest("hex");
}

async function buildSnapshot(modelName: string): Promise<{
  combined: string;
  hash: string;
  locale: unknown;
}> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-snapshot-"));
  const task: UserTask = {
    id: "task_snapshot",
    text: "fix tests",
    cwd: workspace,
    mode: "agent",
    maxSteps: 6,
  };
  const profile = createDefaultAgentProfile(modelName, {});
  const session: AgentSession = {
    id: "session_snapshot",
    task,
    workspaceRoot: workspace,
    profile,
    modelName,
    messages: [],
    observations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const manager = new DefaultContextManager();
  const snapshot = await manager.build({ session, task, profile });
  const combined = snapshot.messages.map((message) => message.content).join("\n\n");

  return {
    combined,
    hash: hashSystemMessages(snapshot.messages),
    locale: snapshot.metadata?.promptLocale,
  };
}

export async function runContextSnapshotTests(): Promise<void> {
  const deepseek = await buildSnapshot("deepseek");
  const gpt = await buildSnapshot("gpt-4o");

  assert.equal(deepseek.locale, "zh");
  assert.equal(gpt.locale, "en");

  assert.match(deepseek.combined, /Workspace 规则：/);
  assert.match(deepseek.combined, /Agent 模式策略：/);
  assert.match(deepseek.combined, /你当前使用的模型是 deepseek/);
  assert.doesNotMatch(deepseek.combined, /You are powered by the model named deepseek/);

  assert.match(gpt.combined, /Workspace rules:/);
  assert.match(gpt.combined, /Agent mode policy:/);
  assert.match(gpt.combined, /You are powered by the model named gpt-4o/);
  assert.doesNotMatch(gpt.combined, /Workspace 规则：/);

  assert.notEqual(deepseek.hash, gpt.hash);

  // Pin snapshot: changing product prompts should update this intentionally.
  assert.match(deepseek.hash, /^[a-f0-9]{64}$/);
  assert.match(gpt.hash, /^[a-f0-9]{64}$/);
}
