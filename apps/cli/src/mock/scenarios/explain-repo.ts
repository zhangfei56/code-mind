import type { MockScenario } from "../types.js";
import { MOCK_SESSION_ID, MOCK_RUN_ID, mockAgentEvent } from "../types.js";

const SUMMARY = `## code-mind 项目概述

这是一个 **local-first code agent** monorepo，基于 pnpm workspace 管理。

### 核心定位
- **ask** — 只读咨询
- **edit** — 执行编辑（默认）
`;

let seqExplain = 0;

export const explainRepoScenario: MockScenario = {
  id: "explain-repo",
  description: "5-step read-only repo exploration (default run UI demo)",
  taskText: "explain this repo",
  mode: "edit",
  cwd: process.cwd(),
  task: {
    id: "task_mock",
    text: "explain this repo",
    cwd: process.cwd(),
    mode: "edit",
    maxSteps: 12,
  },
  result: {
    sessionId: MOCK_SESSION_ID,
    runId: MOCK_RUN_ID,
    status: "success",
    finalText: "",
    summary: SUMMARY,
    steps: 5,
    modelName: "deepseek",
    metadata: {
      activitySummary: { last: "summarizing", counts: { read: 3, search: 1, edit: 0, shell: 0 } },
      completion: "diagnosed_only",
      modifiedFiles: [],
      tokenUsage: { inputTokens: 38_200, outputTokens: 1_180, totalTokens: 39_380 },
    },
  },
  events: [
    mockAgentEvent(++seqExplain, {
      kind: "turn.started",
      payload: {
        modelName: "deepseek",
        maxSteps: 12,
        requestedMaxSteps: 10,
        baseMaxSteps: 12,
        mode: "edit",
      },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "activity.updated",
      payload: { activity: "reading" },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "step.started",
      correlation: { step: 1 },
      payload: { step: 1, maxSteps: 12 },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "model.request",
      correlation: { step: 1 },
      payload: { step: 1, maxSteps: 12, messageCount: 8 },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "model.response",
      correlation: { step: 1 },
      payload: {
        step: 1,
        maxSteps: 12,
        finishReason: "tool_call",
        toolCallCount: 1,
        durationMs: 2100,
        contextTokens: 12_400,
        maxContextTokens: 128_000,
        usage: { inputTokens: 12_400, outputTokens: 320, totalTokens: 12_720 },
        textPreview: "先列出仓库根目录，确认项目结构。",
        plannedToolCalls: [
          { id: "tc_1", name: "list_dir", arguments: { path: "." } },
        ],
      },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "tool.call",
      correlation: { step: 1, toolCallId: "tc_1" },
      payload: {
        step: 1,
        maxSteps: 12,
        toolCall: { id: "tc_1", name: "list_dir", arguments: { path: "." } },
      },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "tool.result",
      correlation: { step: 1, toolCallId: "tc_1" },
      payload: {
        step: 1,
        maxSteps: 12,
        toolCall: { id: "tc_1", name: "list_dir", arguments: { path: "." } },
        success: true,
        durationMs: 45,
        outputPreview: "README.md\npackage.json\napps/\npackages/",
      },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "step.started",
      correlation: { step: 2 },
      payload: { step: 2, maxSteps: 12 },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "model.request",
      correlation: { step: 2 },
      payload: { step: 2, maxSteps: 12, messageCount: 12 },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "model.response",
      correlation: { step: 2 },
      payload: {
        step: 2,
        maxSteps: 12,
        finishReason: "tool_call",
        toolCallCount: 2,
        durationMs: 1800,
        contextTokens: 18_600,
        maxContextTokens: 128_000,
        usage: { inputTokens: 18_600, outputTokens: 410, totalTokens: 19_010 },
        textPreview:
          "先读 README 了解项目定位，再读 CLI 指南确认命令与运行方式。",
        plannedToolCalls: [
          { id: "tc_2", name: "read_file", arguments: { path: "README.md" } },
          {
            id: "tc_3",
            name: "read_file",
            arguments: { path: "docs/user-guide.md" },
          },
        ],
      },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "tool.call",
      correlation: { step: 2, toolCallId: "tc_2" },
      payload: {
        step: 2,
        maxSteps: 12,
        toolCall: { id: "tc_2", name: "read_file", arguments: { path: "README.md" } },
      },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "tool.result",
      correlation: { step: 2, toolCallId: "tc_2" },
      payload: {
        step: 2,
        maxSteps: 12,
        toolCall: { id: "tc_2", name: "read_file", arguments: { path: "README.md" } },
        success: true,
        durationMs: 12,
      },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "tool.call",
      correlation: { step: 2, toolCallId: "tc_3" },
      payload: {
        step: 2,
        maxSteps: 12,
        toolCall: {
          id: "tc_3",
          name: "read_file",
          arguments: { path: "docs/user-guide.md" },
        },
      },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "tool.result",
      correlation: { step: 2, toolCallId: "tc_3" },
      payload: {
        step: 2,
        maxSteps: 12,
        toolCall: {
          id: "tc_3",
          name: "read_file",
          arguments: { path: "docs/user-guide.md" },
        },
        success: true,
        durationMs: 9,
      },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "step.started",
      correlation: { step: 3 },
      payload: { step: 3, maxSteps: 12 },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "context.compacted",
      correlation: { step: 3 },
      payload: {
        step: 3,
        maxSteps: 12,
        compactionCount: 1,
        messageCount: 24,
      },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "model.request",
      correlation: { step: 3 },
      payload: { step: 3, maxSteps: 12, messageCount: 14 },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "model.response",
      correlation: { step: 3 },
      payload: {
        step: 3,
        maxSteps: 12,
        finishReason: "stop",
        toolCallCount: 0,
        durationMs: 3200,
        contextTokens: 7_200,
        maxContextTokens: 128_000,
        usage: { inputTokens: 7_200, outputTokens: 450, totalTokens: 7_650 },
        textPreview: "## code-mind 项目概述",
      },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "activity.updated",
      payload: { activity: "summarizing" },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "step.started",
      correlation: { step: 5 },
      payload: { step: 5, maxSteps: 12 },
    }),
    mockAgentEvent(++seqExplain, {
      kind: "turn.finished",
      payload: {
        status: "success",
        steps: 5,
        finalText: SUMMARY,
        mode: "edit",
        completion: "diagnosed_only",
        modifiedFilesCount: 0,
        tokenUsage: { inputTokens: 38_200, outputTokens: 1_180, totalTokens: 39_380 },
      },
    }),
  ],
};
