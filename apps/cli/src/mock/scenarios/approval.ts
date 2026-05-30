import type { MockScenario } from "../types.js";
import { MOCK_SESSION_ID, MOCK_RUN_ID, mockAgentEvent } from "../types.js";

let seqApproval = 0;

export const approvalScenario: MockScenario = {
  id: "approval",
  description: "High-risk patch approval prompt (interactive UI demo)",
  taskText: "fix auth middleware",
  mode: "edit",
  cwd: process.cwd(),
  task: {
    id: "task_mock_approval",
    text: "fix auth middleware",
    cwd: process.cwd(),
    mode: "edit",
    maxSteps: 12,
  },
  result: {
    sessionId: MOCK_SESSION_ID,
    runId: MOCK_RUN_ID,
    status: "user_rejected",
    finalText: "Patch was not approved.",
    steps: 3,
    modelName: "deepseek",
    metadata: {
      activitySummary: { last: "editing", counts: { read: 1, search: 0, edit: 1, shell: 0 } },
      completion: "no_progress",
    },
  },
  events: [
    mockAgentEvent(++seqApproval, {
      kind: "turn.started",
      payload: {
        modelName: "deepseek",
        maxSteps: 12,
        requestedMaxSteps: 10,
        baseMaxSteps: 12,
        mode: "edit",
      },
    }),
    mockAgentEvent(++seqApproval, {
      kind: "activity.updated",
      payload: { activity: "reading" },
    }),
    mockAgentEvent(++seqApproval, {
      kind: "step.started",
      correlation: { step: 1 },
      payload: { step: 1, maxSteps: 12 },
    }),
    mockAgentEvent(++seqApproval, {
      kind: "model.response",
      correlation: { step: 1 },
      payload: {
        step: 1,
        maxSteps: 12,
        finishReason: "tool_call",
        toolCallCount: 1,
        durationMs: 1100,
        contextTokens: 9_500,
        maxContextTokens: 128_000,
        usage: { inputTokens: 9_500, outputTokens: 200, totalTokens: 9_700 },
      },
    }),
    mockAgentEvent(++seqApproval, {
      kind: "tool.call",
      correlation: { step: 1, toolCallId: "tc_r1" },
      payload: {
        step: 1,
        maxSteps: 12,
        toolCall: { id: "tc_r1", name: "read_file", arguments: { path: "src/auth.ts" } },
      },
    }),
    mockAgentEvent(++seqApproval, {
      kind: "tool.result",
      correlation: { step: 1, toolCallId: "tc_r1" },
      payload: {
        step: 1,
        maxSteps: 12,
        toolCall: { id: "tc_r1", name: "read_file", arguments: { path: "src/auth.ts" } },
        success: true,
        durationMs: 8,
      },
    }),
    mockAgentEvent(++seqApproval, {
      kind: "activity.updated",
      payload: { activity: "editing" },
    }),
    mockAgentEvent(++seqApproval, {
      kind: "step.started",
      correlation: { step: 2 },
      payload: { step: 2, maxSteps: 12 },
    }),
    mockAgentEvent(++seqApproval, {
      kind: "model.response",
      correlation: { step: 2 },
      payload: {
        step: 2,
        maxSteps: 12,
        finishReason: "tool_call",
        toolCallCount: 1,
        durationMs: 1400,
        contextTokens: 11_200,
        maxContextTokens: 128_000,
        usage: { inputTokens: 11_200, outputTokens: 350, totalTokens: 11_550 },
      },
    }),
    mockAgentEvent(++seqApproval, {
      kind: "tool.call",
      correlation: { step: 2, toolCallId: "tc_p1" },
      payload: {
        step: 2,
        maxSteps: 12,
        toolCall: { id: "tc_p1", name: "apply_patch", arguments: { patch: "..." } },
      },
    }),
    mockAgentEvent(++seqApproval, {
      kind: "approval.requested",
      correlation: { step: 2, toolCallId: "tc_p1" },
      payload: {
        step: 2,
        maxSteps: 12,
        toolCall: { id: "tc_p1", name: "apply_patch", arguments: { patch: "..." } },
        reason: "modifies 3 files outside allowlist",
        approvalId: "approval_mock_001",
      },
    }),
    mockAgentEvent(++seqApproval, {
      kind: "turn.finished",
      payload: {
        status: "user_rejected",
        steps: 3,
        finalText: "Patch was not approved.",
        mode: "edit",
        completion: "no_progress",
      },
    }),
  ],
};
