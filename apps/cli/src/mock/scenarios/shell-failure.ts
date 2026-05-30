import type { MockScenario } from "../types.js";
import { MOCK_SESSION_ID, MOCK_RUN_ID, mockAgentEvent } from "../types.js";

let seqShell = 0;

export const shellFailureScenario: MockScenario = {
  id: "shell-failure",
  description: "Tool failure mid-run (error UI demo)",
  taskText: "run tests",
  mode: "edit",
  cwd: process.cwd(),
  task: {
    id: "task_mock_fail",
    text: "run tests",
    cwd: process.cwd(),
    mode: "edit",
    maxSteps: 12,
  },
  result: {
    sessionId: MOCK_SESSION_ID,
    runId: MOCK_RUN_ID,
    status: "failed",
    finalText: "Shell command failed with exit code 1.",
    steps: 2,
    modelName: "deepseek",
    metadata: {
      activitySummary: { last: "running", counts: { read: 0, search: 0, edit: 0, shell: 2 } },
      completion: "no_progress",
    },
  },
  events: [
    mockAgentEvent(++seqShell, {
      kind: "turn.started",
      payload: {
        modelName: "deepseek",
        maxSteps: 12,
        requestedMaxSteps: 10,
        baseMaxSteps: 12,
        mode: "edit",
      },
    }),
    mockAgentEvent(++seqShell, {
      kind: "activity.updated",
      payload: { activity: "reading" },
    }),
    mockAgentEvent(++seqShell, {
      kind: "step.started",
      correlation: { step: 1 },
      payload: { step: 1, maxSteps: 12 },
    }),
    mockAgentEvent(++seqShell, {
      kind: "model.request",
      correlation: { step: 1 },
      payload: { step: 1, maxSteps: 12, messageCount: 6 },
    }),
    mockAgentEvent(++seqShell, {
      kind: "model.response",
      correlation: { step: 1 },
      payload: {
        step: 1,
        maxSteps: 12,
        finishReason: "tool_call",
        toolCallCount: 1,
        durationMs: 900,
        contextTokens: 8_000,
        maxContextTokens: 128_000,
        usage: { inputTokens: 8_000, outputTokens: 120, totalTokens: 8_120 },
      },
    }),
    mockAgentEvent(++seqShell, {
      kind: "tool.call",
      correlation: { step: 1, toolCallId: "tc_s1" },
      payload: {
        step: 1,
        maxSteps: 12,
        toolCall: { id: "tc_s1", name: "run_shell", arguments: { command: "pnpm test" } },
      },
    }),
    mockAgentEvent(++seqShell, {
      kind: "tool.result",
      correlation: { step: 2, toolCallId: "tc_s1" },
      payload: {
        step: 2,
        maxSteps: 12,
        toolCall: { id: "tc_s1", name: "run_shell", arguments: { command: "pnpm test" } },
        success: true,
        durationMs: 4200,
        exitCode: 0,
        outputPreview: "PASS tests/user.test.ts\nTest Suites: 1 passed\nTests: 8 passed",
      },
    }),
    mockAgentEvent(++seqShell, {
      kind: "step.started",
      correlation: { step: 2 },
      payload: { step: 2, maxSteps: 12 },
    }),
    mockAgentEvent(++seqShell, {
      kind: "model.request",
      correlation: { step: 2 },
      payload: { step: 2, maxSteps: 12, messageCount: 10 },
    }),
    mockAgentEvent(++seqShell, {
      kind: "model.response",
      correlation: { step: 2 },
      payload: {
        step: 2,
        maxSteps: 12,
        finishReason: "tool_call",
        toolCallCount: 1,
        durationMs: 700,
        contextTokens: 12_000,
        maxContextTokens: 128_000,
        usage: { inputTokens: 12_000, outputTokens: 90, totalTokens: 12_090 },
      },
    }),
    mockAgentEvent(++seqShell, {
      kind: "tool.call",
      correlation: { step: 2, toolCallId: "tc_s2" },
      payload: {
        step: 2,
        maxSteps: 12,
        toolCall: { id: "tc_s2", name: "run_shell", arguments: { command: "false" } },
      },
    }),
    mockAgentEvent(++seqShell, {
      kind: "tool.result",
      correlation: { step: 2, toolCallId: "tc_s2" },
      payload: {
        step: 2,
        maxSteps: 12,
        toolCall: { id: "tc_s2", name: "run_shell", arguments: { command: "false" } },
        success: false,
        error: "exit 1",
        durationMs: 30,
        exitCode: 1,
      },
    }),
    mockAgentEvent(++seqShell, {
      kind: "turn.finished",
      payload: {
        status: "failed",
        steps: 2,
        finalText: "Shell command failed with exit code 1.",
        mode: "edit",
        completion: "no_progress",
      },
    }),
  ],
};
