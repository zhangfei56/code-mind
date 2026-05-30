import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderSessionList, renderSessionShow } from "../../apps/cli/src/commands/sessions.js";
import { createTestSessionStore } from "./helpers/session-store.js";
import type { AgentProfile, UserTask } from "@code-mind/shared";

export async function runSessionCliTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-sessions-"));
  const store = createTestSessionStore(workspace);
  const task: UserTask = {
    id: "task_1",
    text: "修复测试失败",
    cwd: workspace,
    mode: "edit",
    maxSteps: 4,
  };
  const profile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "You are a code agent.",
  };

  const session = await store.create(task, profile);
  await store.updateManifest(session.id, {
    model: "local",
    status: "success",
    completion: "modified_verified",
  });
  await store.saveCurrentSummary(session.id, "# Current Summary\n\nDone.");

  const listOutput = await renderSessionList(workspace);
  const showOutput = await renderSessionShow(workspace, session.id);

  assert.match(listOutput, new RegExp(session.id));
  assert.match(listOutput, /success/);
  assert.match(listOutput, /modified_verified/);
  assert.match(showOutput, /"model": "local"/);
  assert.match(showOutput, /Completion: modified_verified/);
  assert.match(showOutput, /# Current Summary/);
}
