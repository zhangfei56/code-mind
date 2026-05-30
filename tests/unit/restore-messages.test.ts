import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  messageAssistantEvent,
  messageUserEvent,
  toolResultEvent,
} from "@code-mind/core";
import { createTestSessionStore } from "./helpers/session-store.js";
import type { AgentProfile, UserTask } from "@code-mind/shared";
import { seedSessionTranscript } from "./helpers/seed-session-transcript.js";

export async function runRestoreMessagesTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-restore-msg-"));
  const store = createTestSessionStore(workspace);
  const task: UserTask = {
    id: "task_1",
    text: "read file",
    cwd: workspace,
    mode: "ask",
    maxSteps: 4,
  };
  const profile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "demo",
  };
  const session = await store.create(task, profile);

  const tc = {
    id: "call_read",
    name: "read_file",
    arguments: { path: "src/a.ts" },
  } as const;

  await seedSessionTranscript(workspace, session.id, [
    messageUserEvent(task.text),
    messageAssistantEvent("I'll read the file.", [tc], "tool_call"),
    toolResultEvent({
      step: 1,
      maxSteps: task.maxSteps,
      toolCall: tc,
      success: true,
      output: "export const a = 1;",
      outputPreview: "export const a = 1;",
    }),
  ]);

  const restored = await store.restoreSession(session.id, profile);
  const assistant = restored.messages.find((message) => message.role === "assistant");
  assert.ok(assistant);
  assert.equal(assistant?.toolCalls?.length, 1);
  assert.equal(assistant?.toolCalls?.[0]?.name, "read_file");
  assert.equal(restored.messages.filter((message) => message.role === "tool").length, 1);
}
