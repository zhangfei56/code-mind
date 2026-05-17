import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRuntime } from "../../src/agent/runtime.js";
import { FileSessionStore } from "../../src/session/session-store.js";
import { createSessionRecord } from "../../src/session/session-record.js";
import type {
  AgentProfile,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  UserTask,
} from "../../src/shared/types.js";

class ResumeProvider implements ModelProvider {
  name = "fake-resume";

  async chat(request: ModelRequest): Promise<ModelResponse> {
    const toolMessages = request.messages.filter((message) => message.role === "tool");
    assert.ok(toolMessages.length >= 1);
    assert.match(toolMessages[toolMessages.length - 1]?.content ?? "", /1 export function add/);

    return {
      text: "Resumed session and continued successfully.",
      finishReason: "stop",
      raw: {},
      toolCalls: [],
    };
  }

  getCapabilities(): ModelCapabilities {
    return {
      toolCall: true,
      parallelToolCall: false,
      jsonSchema: true,
      vision: false,
      reasoning: false,
      maxContextTokens: 100000,
      maxOutputTokens: 8000,
      supportsPromptCache: false,
      supportsComputerUse: false,
    };
  }
}

export async function runResumeTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-resume-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  writeFileSync(
    join(workspace, "src", "math.ts"),
    "export function add(a: number, b: number): number {\n  return a - b;\n}\n",
    "utf8",
  );

  const store = new FileSessionStore(workspace);
  const task: UserTask = {
    id: "task_1",
    text: "修复测试失败",
    cwd: workspace,
    mode: "suggest",
    maxSteps: 2,
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
  await store.appendRecord(
    createSessionRecord(session.id, "assistant_message", { content: "" }),
  );
  await store.appendRecord(
    createSessionRecord(session.id, "tool_call", {
      id: "call_read",
      name: "read_file",
      arguments: { path: "src/math.ts" },
    }),
  );
  await store.appendRecord(
    createSessionRecord(session.id, "tool_result", {
      toolCallId: "call_read",
      success: true,
      output: "1 export function add(a: number, b: number): number {\n2   return a - b;\n3 }",
    }),
  );
  await store.updateManifest(session.id, {
    model: "fake-resume",
    status: "stopped_by_limit",
  });

  const runtime = new AgentRuntime();
  const result = await runtime.run({
    task: {
      id: "task_resume",
      text: task.text,
      cwd: workspace,
      mode: task.mode,
      maxSteps: 3,
    },
    profile,
    model: new ResumeProvider(),
    resumeSessionId: session.id,
  });

  assert.equal(result.status, "success");
  assert.match(result.finalText, /Resumed session/);

  const manifest = readFileSync(
    join(store.getSessionDir(session.id), "session.json"),
    "utf8",
  );
  const summary = readFileSync(
    join(store.getSessionDir(session.id), "summary.md"),
    "utf8",
  );
  const sessions = readdirSync(join(workspace, ".agent", "sessions"));

  assert.equal(sessions.length, 1);
  assert.match(manifest, /"status": "success"/);
  assert.match(summary, /Resumed session/);
}
