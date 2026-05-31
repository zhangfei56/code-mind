import assert from "node:assert/strict";
import {
  applyCompaction,
  buildCompactionMergeMessages,
  buildCompactionMergePrompt,
  buildCompactionSummarizeInput,
  estimateSessionContextChars,
  hasCompactionEviction,
  shouldCompact,
} from "@code-mind/context";
import { createCompactionPort } from "@code-mind/core";
import { FileSessionStore } from "@code-mind/session";
import type {
  AgentSession,
  InternalMessage,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  Observation,
  UserTask,
} from "@code-mind/shared";
import { DEFAULT_COMPACTION_POLICY, resolveCompactionPolicyFromEnv } from "@code-mind/shared";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeSession(messages: InternalMessage[], observations: Observation[] = []): AgentSession {
  const task: UserTask = {
    id: "task_1",
    text: "fix tests",
    cwd: "/tmp/ws",
    mode: "agent",
    maxSteps: 8,
  };
  return {
    id: "session_1",
    task,
    workspaceRoot: "/tmp/ws",
    profile: { id: "default", name: "Default", systemPrompt: "base" },
    modelName: "deepseek",
    messages,
    observations,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

class MockCompactionModel implements ModelProvider {
  name = "mock-compact";
  calls = 0;

  async chat(request: ModelRequest): Promise<ModelResponse> {
    this.calls += 1;
    assert.equal(request.tools?.length ?? 0, 0);
    assert.equal(request.metadata?.purpose, "compaction");
    return {
      text: "# Session compaction (rolling)\n\n## Task\n\n- fix tests\n",
      finishReason: "stop",
      raw: {},
      toolCalls: [],
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
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

class FailingCompactionModel implements ModelProvider {
  name = "fail-compact";

  async chat(): Promise<ModelResponse> {
    throw new Error("compaction model unavailable");
  }

  getCapabilities(): ModelCapabilities {
    return new MockCompactionModel().getCapabilities();
  }
}

export async function runCompactionTests(): Promise<void> {
  const shortMessages: InternalMessage[] = [
    { id: "u1", role: "user", content: "hi", createdAt: new Date().toISOString() },
  ];
  assert.equal(shouldCompact(makeSession(shortMessages)), false);

  const longContent = "x".repeat(18_000);
  const longMessages: InternalMessage[] = [
    { id: "u1", role: "user", content: longContent, createdAt: new Date().toISOString() },
    { id: "a1", role: "assistant", content: "ok", createdAt: new Date().toISOString() },
    { id: "u2", role: "user", content: "more", createdAt: new Date().toISOString() },
    { id: "a2", role: "assistant", content: "done", createdAt: new Date().toISOString() },
    { id: "u3", role: "user", content: "tail", createdAt: new Date().toISOString() },
    { id: "a3", role: "assistant", content: "tail2", createdAt: new Date().toISOString() },
    { id: "u4", role: "user", content: "tail3", createdAt: new Date().toISOString() },
    { id: "a4", role: "assistant", content: "tail4", createdAt: new Date().toISOString() },
    { id: "u5", role: "user", content: "tail5", createdAt: new Date().toISOString() },
    { id: "a5", role: "assistant", content: "tail6", createdAt: new Date().toISOString() },
  ];
  assert.equal(shouldCompact(makeSession(longMessages)), true);

  const obs: Observation[] = [
    {
      toolCall: { id: "c1", name: "read_file", arguments: { path: "a.ts" } },
      toolResult: { success: true, output: "y".repeat(500) },
      createdAt: new Date().toISOString(),
    },
  ];
  assert.equal(shouldCompact(makeSession(shortMessages, obs)), false);
  assert.ok(shouldCompact(makeSession([{ id: "u1", role: "user", content: "x".repeat(17_500), createdAt: new Date().toISOString() }], obs)));

  const rollingSummary = "# Session compaction (rolling)\n\n## Task\n\n- fix tests\n";
  const session = makeSession(longMessages);
  applyCompaction(session, rollingSummary);
  assert.equal(session.messages.length, DEFAULT_COMPACTION_POLICY.retainedMessages);
  assert.equal(session.metadata?.compactionSummary, rollingSummary);
  assert.equal(session.metadata?.compactionBlockedContextChars, undefined);

  const input = buildCompactionSummarizeInput(makeSession(longMessages));
  assert.equal(input.taskText, "fix tests");
  assert.ok(hasCompactionEviction(input));

  const mergePrompt = buildCompactionMergePrompt(input);
  assert.match(mergePrompt.system, /rolling Markdown summary|rolling Markdown 摘要/);
  assert.match(mergePrompt.user, /fix tests/);

  const mergeMessages = buildCompactionMergeMessages(input);
  assert.equal(mergeMessages.length, 2);

  const mockModel = new MockCompactionModel();
  const llmPort = createCompactionPort(mockModel, DEFAULT_COMPACTION_POLICY);
  const llmResult = await llmPort.summarize(input);
  assert.equal(llmResult.strategy, "llm");
  assert.equal(llmResult.modelName, "mock-compact");
  assert.match(llmResult.summaryMarkdown, /# Session compaction \(rolling\)/);

  const failPort = createCompactionPort(new FailingCompactionModel(), DEFAULT_COMPACTION_POLICY);
  await assert.rejects(() => failPort.summarize(input), /compaction model unavailable/);

  const emptyEvicted = buildCompactionSummarizeInput(makeSession([{ id: "u1", role: "user", content: "solo", createdAt: new Date().toISOString() }]));
  assert.equal(hasCompactionEviction(emptyEvicted), false);

  const previousThreshold = process.env.CODE_MIND_COMPACTION_CHAR_THRESHOLD;
  process.env.CODE_MIND_COMPACTION_CHAR_THRESHOLD = "12000";
  try {
    assert.equal(resolveCompactionPolicyFromEnv().charThreshold, 12_000);
  } finally {
    if (previousThreshold === undefined) {
      delete process.env.CODE_MIND_COMPACTION_CHAR_THRESHOLD;
    } else {
      process.env.CODE_MIND_COMPACTION_CHAR_THRESHOLD = previousThreshold;
    }
  }

  const workspace = mkdtempSync(join(tmpdir(), "code-mind-restore-compact-"));
  const store = new FileSessionStore(workspace);
  const profile = { id: "default", name: "Default", systemPrompt: "base" };
  const task: UserTask = {
    id: "task_1",
    text: "resume compact",
    cwd: workspace,
    mode: "agent",
    maxSteps: 8,
  };
  const persisted = await store.create(task, profile);
  mkdirSync(join(store.getCompactDir(persisted.id)), { recursive: true });
  writeFileSync(
    join(store.getCompactDir(persisted.id), "compact-001.md"),
    "# Session compaction (rolling)\n\nold snapshot",
    "utf8",
  );
  writeFileSync(
    join(store.getCompactDir(persisted.id), "compact-002.md"),
    "# Session compaction (rolling)\n\nlatest snapshot",
    "utf8",
  );
  await store.updateManifest(persisted.id, { status: "running", model: "deepseek" });

  const restored = await store.restoreSession(persisted.id, profile);
  assert.equal(restored.metadata?.compactionSummary, "# Session compaction (rolling)\n\nlatest snapshot");
  assert.equal(restored.metadata?.compactionCount, 2);
  assert.ok(estimateSessionContextChars(restored) >= 0);
}
