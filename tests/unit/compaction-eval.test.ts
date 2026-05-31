import assert from "node:assert/strict";
import {
  buildCompactionMergePrompt,
  buildCompactionSummarizeInput,
  COMPACTION_EVAL_MIN_HIT_RATE,
  scoreCompactionSummaryRecall,
} from "@code-mind/context";
import type { AgentSession, InternalMessage, Observation } from "@code-mind/shared";
import { DEFAULT_COMPACTION_POLICY } from "@code-mind/shared";

/** Fixed session fixture for trace eval — key facts must survive into summary anchors. */
function buildEvalSession(): AgentSession {
  const messages: InternalMessage[] = [
    {
      id: "u0",
      role: "user",
      content: "Fix auth middleware timeout in packages/api/src/auth.ts",
      createdAt: "2026-05-31T00:00:00.000Z",
    },
    {
      id: "a0",
      role: "assistant",
      content: "I'll inspect auth.ts and run tests with pnpm test auth.",
      createdAt: "2026-05-31T00:01:00.000Z",
    },
    {
      id: "u1",
      role: "user",
      content: "x".repeat(20_000),
      createdAt: "2026-05-31T00:02:00.000Z",
    },
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `tail-u${index}`,
      role: "user" as const,
      content: `follow-up ${index}`,
      createdAt: "2026-05-31T00:03:00.000Z",
    })),
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `tail-a${index}`,
      role: "assistant" as const,
      content: `ack ${index}`,
      createdAt: "2026-05-31T00:04:00.000Z",
    })),
  ];

  const observations: Observation[] = [
    {
      id: "obs0",
      step: 1,
      toolCall: { id: "tc0", name: "read_file", arguments: { path: "packages/api/src/auth.ts" } },
      toolResult: {
        success: true,
        output: "export function verifyToken() { /* 120s timeout bug */ }",
      },
      createdAt: "2026-05-31T00:01:30.000Z",
    },
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `obs-tail-${index}`,
      step: index + 2,
      toolCall: { id: `tc${index + 1}`, name: "run_shell", arguments: { command: "pnpm test" } },
      toolResult: { success: true, output: `test chunk ${index}` },
      createdAt: "2026-05-31T00:05:00.000Z",
    })),
  ];

  return {
    id: "session_eval",
    task: {
      id: "task_eval",
      text: "Fix auth middleware timeout in packages/api/src/auth.ts",
      cwd: "/tmp/ws",
      mode: "agent",
      maxSteps: 12,
    },
    workspaceRoot: "/tmp/ws",
    profile: { id: "default", name: "Default", systemPrompt: "base" },
    modelName: "deepseek",
    messages,
    observations,
    metadata: {
      compactionSummary:
        "# Session compaction (rolling)\n\n## Task\n\n- Fix auth middleware timeout\n",
    },
    createdAt: "2026-05-31T00:00:00.000Z",
    updatedAt: "2026-05-31T00:06:00.000Z",
  };
}

const EVAL_ANCHORS = [
  { id: "task", pattern: "auth middleware timeout" },
  { id: "path", pattern: "packages/api/src/auth.ts" },
  { id: "command", pattern: "pnpm test" },
  { id: "decision", pattern: /120s timeout|verifyToken/i },
  { id: "heading", pattern: "# Session compaction (rolling)" },
];

const MOCK_SUMMARY = [
  "# Session compaction (rolling)",
  "",
  "## Task",
  "",
  "- Fix auth middleware timeout in packages/api/src/auth.ts",
  "",
  "## Decisions",
  "",
  "- verifyToken used 120s timeout; reduce and re-run pnpm test",
  "",
  "## Evidence",
  "",
  "- packages/api/src/auth.ts",
].join("\n");

export function runCompactionEvalTests(): void {
  const session = buildEvalSession();
  const input = buildCompactionSummarizeInput(session, DEFAULT_COMPACTION_POLICY);
  const prompt = buildCompactionMergePrompt(input);

  assert.ok(prompt.user.includes("auth middleware timeout"));
  assert.ok(prompt.user.includes("packages/api/src/auth.ts"));
  assert.ok(input.evictedMessages.length > 0 || input.evictedObservations.length > 0);

  const score = scoreCompactionSummaryRecall(MOCK_SUMMARY, EVAL_ANCHORS);
  assert.equal(score.total, EVAL_ANCHORS.length);
  assert.equal(score.missing.length, 0);
  assert.ok(score.hitRate >= COMPACTION_EVAL_MIN_HIT_RATE);

  const weak = scoreCompactionSummaryRecall("# Session compaction (rolling)\n\n## Task\n\n- unrelated", EVAL_ANCHORS);
  assert.ok(weak.hitRate < COMPACTION_EVAL_MIN_HIT_RATE);
  assert.ok(weak.missing.length > 0);
}
