import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compactSessionIfNeeded,
  createRunState,
  type CompactionPort,
  type SessionLifecycleDeps,
} from "@code-mind/core";
import { createTestSessionStore } from "./helpers/session-store.js";
import type {
  AgentEventInput,
  AgentProfile,
  CompactionSummarizeInput,
  CompactionSummarizeResult,
  InternalMessage,
  ModelProvider,
  SessionManifest,
  UserTask,
} from "@code-mind/shared";
import { DEFAULT_COMPACTION_POLICY } from "@code-mind/shared";

function buildLongMessages(): InternalMessage[] {
  const messages: InternalMessage[] = [];
  for (let index = 0; index < 10; index += 1) {
    messages.push({
      id: `u${index}`,
      role: "user",
      content: index === 0 ? "x".repeat(18_000) : `step ${index}`,
      createdAt: new Date().toISOString(),
    });
    messages.push({
      id: `a${index}`,
      role: "assistant",
      content: `reply ${index}`,
      createdAt: new Date().toISOString(),
    });
  }
  return messages;
}

class StubModel implements ModelProvider {
  name = "fake";

  async chat(): Promise<never> {
    throw new Error("unexpected agent chat");
  }

  getCapabilities() {
    return {
      toolCall: true,
      parallelToolCall: false,
      jsonSchema: true,
      vision: false,
      reasoning: false,
      maxContextTokens: 128_000,
      maxOutputTokens: 8000,
      supportsPromptCache: false,
      supportsComputerUse: false,
    };
  }
}

function createFailingPort(): CompactionPort {
  return {
    async summarize(_input: CompactionSummarizeInput): Promise<CompactionSummarizeResult> {
      throw new Error("Compaction model returned empty summary.");
    },
  };
}

function createSuccessPort(summary: string): CompactionPort {
  return {
    async summarize(_input: CompactionSummarizeInput): Promise<CompactionSummarizeResult> {
      return {
        summaryMarkdown: summary,
        strategy: "llm",
        modelName: "compact-model",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        durationMs: 12,
      };
    },
  };
}

export async function runCompactionLifecycleTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-compact-lifecycle-"));
  const store = createTestSessionStore(workspace);
  const task: UserTask = {
    id: "task_1",
    text: "fix all tests",
    cwd: workspace,
    mode: "agent",
    maxSteps: 8,
  };
  const profile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "base",
  };
  const session = await store.create(task, profile);
  session.messages = buildLongMessages();

  const model = new StubModel();
  const runState = createRunState(session.task.maxSteps);
  runState.progress.lastCompletedStep = 2;

  const events: AgentEventInput[] = [];
  const statuses: string[] = [];
  let compactSaveCount = 0;

  const baseLifecycle: SessionLifecycleDeps = {
    review: {
      review: () => ({ issues: [], suggestions: [], needsAnotherIteration: false }),
    },
    publish: async (_input, event) => {
      events.push(event);
    },
    setSessionStatus: async (_sessionStore, _id, status) => {
      statuses.push(status);
    },
    compactionPolicy: DEFAULT_COMPACTION_POLICY,
  };

  const trackingStore = {
    ...store,
    saveCompactSummary: async (_sessionId: string, _summary: string) => {
      compactSaveCount += 1;
      return "compact/compact-001.md";
    },
    recordCompaction: async () => {},
    recordModelUsage: async (): Promise<SessionManifest> => store.readManifest(session.id),
    saveCurrentSummary: async () => {},
  };

  const messageCountBefore = session.messages.length;

  await compactSessionIfNeeded(
    {
      ...baseLifecycle,
      createCompactionPort: () => createFailingPort(),
    },
    trackingStore,
    session,
    model,
    undefined,
    runState,
  );

  assert.equal(session.messages.length, messageCountBefore);
  assert.equal(session.metadata?.compactionSummary, undefined);
  assert.equal(compactSaveCount, 0);
  assert.ok(
    events.some(
      (event) =>
        event.kind === "context.compaction_failed" &&
        String((event.payload as { reason?: string }).reason).includes("empty summary"),
    ),
  );
  assert.equal(typeof session.metadata?.compactionBlockedContextChars, "number");
  assert.deepEqual(statuses, ["compacting", "running"]);

  const eventsAfterBlock = events.length;
  await compactSessionIfNeeded(
    {
      ...baseLifecycle,
      createCompactionPort: () => createFailingPort(),
    },
    trackingStore,
    session,
    model,
    undefined,
    runState,
  );
  assert.equal(events.length, eventsAfterBlock);
  assert.equal(compactSaveCount, 0);

  session.metadata = { ...session.metadata, compactionBlockedContextChars: undefined };
  events.length = 0;
  statuses.length = 0;

  const rolling = "# Session compaction (rolling)\n\n## Task\n\n- fix all tests\n";
  await compactSessionIfNeeded(
    {
      ...baseLifecycle,
      createCompactionPort: () => createSuccessPort(rolling),
    },
    trackingStore,
    session,
    model,
    undefined,
    runState,
  );

  assert.equal(session.metadata?.compactionSummary, rolling);
  assert.equal(session.messages.length, DEFAULT_COMPACTION_POLICY.retainedMessages);
  assert.equal(compactSaveCount, 1);
  assert.ok(events.some((event) => event.kind === "context.compacted"));
  assert.equal(session.metadata?.compactionBlockedContextChars, undefined);
  assert.deepEqual(statuses, ["compacting", "running"]);
}
