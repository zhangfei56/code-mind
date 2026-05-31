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
  assert.match(staticBlock, /当前在仓库根目录/);
  assert.doesNotMatch(staticBlock, /最近活动：|最近工具：|工具计数：|最近验证：/);

  const runFacts: RunFactsSnapshot = {
    mode: "plan",
    atWorkspaceRoot: false,
  };

  const planBlock = buildRunFactsBlock(
    makeSession({ task: { ...makeSession().task, mode: "agent", cwd: "/tmp/ws/src" } }),
    { locale: "zh", runFacts },
  );
  assert.match(planBlock, /- 模式：plan/);
  assert.match(planBlock, /不要修改源码/);
  assert.doesNotMatch(planBlock, /当前在仓库根目录/);

  const enBlock = buildRunFactsBlock(makeSession(), { locale: "en", runFacts: { mode: "agent", atWorkspaceRoot: true } });
  assert.match(enBlock, /Run context:/);
  assert.match(enBlock, /Operating from repository root/);
}
