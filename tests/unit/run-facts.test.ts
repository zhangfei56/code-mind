import assert from "node:assert/strict";
import { buildRunFactsBlock } from "@code-mind/context";
import type { AgentSession, RunFactsSnapshot, UserTask } from "@code-mind/shared";

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  const task: UserTask = {
    id: "task_1",
    text: "fix test",
    cwd: "/tmp/ws",
    mode: "agent",
    maxSteps: 8,
  };
  return {
    id: "session_1",
    task,
    workspaceRoot: "/tmp/ws",
    profile: {
      id: "default",
      name: "Default",
      systemPrompt: "base",
    },
    modelName: "deepseek",
    messages: [],
    observations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function runRunFactsTests(): void {
  const staticBlock = buildRunFactsBlock(makeSession(), { locale: "zh" });
  assert.match(staticBlock, /Run 上下文：/);
  assert.match(staticBlock, /- 模式：agent/);
  assert.match(staticBlock, /若已修改代码，在宣告成功前先验证/);
  assert.doesNotMatch(staticBlock, /已修改文件：/);

  const runFacts: RunFactsSnapshot = {
    mode: "agent",
    step: 3,
    maxSteps: 8,
    closingTurn: false,
    modifiedFiles: ["src/a.ts", "tests/a.test.ts"],
    lastTool: { name: "read_file", at: "2026-05-31T00:00:00.000Z" },
    lastActivity: "reading",
    toolCounts: { read: 4, search: 1, edit: 2, shell: 1 },
    lastVerification: {
      passed: false,
      summary: "1 test failed",
      steps: [],
    },
    atWorkspaceRoot: true,
  };

  const dynamicBlock = buildRunFactsBlock(makeSession(), { locale: "zh", runFacts });
  assert.match(dynamicBlock, /- 步骤：3 \/ 8/);
  assert.match(dynamicBlock, /最近活动：阅读/);
  assert.match(dynamicBlock, /最近工具：read_file/);
  assert.match(dynamicBlock, /工具计数：read 4，search 1，edit 2，shell 1/);
  assert.match(dynamicBlock, /已修改文件：src\/a.ts, tests\/a.test.ts/);
  assert.match(dynamicBlock, /最近验证：失败。1 test failed/);
  assert.match(dynamicBlock, /当前在仓库根目录/);

  const enBlock = buildRunFactsBlock(makeSession(), { locale: "en", runFacts });
  assert.match(enBlock, /Run context:/);
  assert.match(enBlock, /Modified files: src\/a.ts, tests\/a.test.ts/);
}
