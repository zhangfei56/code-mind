import assert from "node:assert/strict";
import {
  createEmptyExplorationEvidence,
  createLoopPolicy,
  isBroadRepoRootTask,
  recommendMaxSteps,
  shouldEnterClosingTurn,
} from "@code-mind/core";

export function runTaskStrategyTests(): void {
  const askPolicy = createLoopPolicy({
    id: "task_1",
    text: "请分析这个项目",
    cwd: "/tmp/demo",
    mode: "ask",
    maxSteps: 8,
  });
  assert.equal(askPolicy.mode, "ask");
  assert.equal(askPolicy.autoVerifyAfterPatch, false);

  const editPolicy = createLoopPolicy({
    id: "task_2",
    text: "修复测试失败",
    cwd: "/tmp/demo",
    mode: "edit",
    maxSteps: 8,
  });
  assert.equal(editPolicy.mode, "edit");
  assert.equal(editPolicy.autoVerifyAfterPatch, true);
  assert.equal(editPolicy.explorationBudget, 4);

  const agentPolicy = createLoopPolicy({
    id: "task_3",
    text: "fix failing test",
    cwd: "/tmp/demo",
    mode: "agent",
    maxSteps: 8,
  });
  assert.equal(agentPolicy.mode, "agent");
  assert.equal(agentPolicy.maxRecoveryAttempts, 2);

  const planPolicy = createLoopPolicy({
    id: "task_plan",
    text: "plan refactor",
    cwd: "/tmp/demo",
    mode: "plan",
    maxSteps: 8,
  });
  assert.equal(planPolicy.mode, "plan");
  assert.equal(planPolicy.autoVerifyAfterPatch, false);

  assert.equal(
    shouldEnterClosingTurn({
      policy: askPolicy,
      step: askPolicy.explorationBudget,
      maxSteps: 8,
      modifiedFilesCount: 0,
      hasVerificationResult: false,
      evidence: {
        ...createEmptyExplorationEvidence(),
        projectRootConfirmed: true,
        entryFileRead: true,
      },
    }),
    true,
  );

  assert.equal(
    isBroadRepoRootTask(
      {
        id: "task_4",
        text: "请修一个最容易复现的交互 bug",
        cwd: "/tmp/demo",
        mode: "edit",
        maxSteps: 8,
      },
      "/tmp/demo",
    ),
    true,
  );
  assert.equal(
    recommendMaxSteps(
      {
        id: "task_5",
        text: "请分析 code-mind 最容易失败的点",
        cwd: "/tmp/demo",
        mode: "ask",
        maxSteps: 8,
      },
      "/tmp/demo",
    ),
    12,
  );
  assert.equal(
    shouldEnterClosingTurn({
      policy: editPolicy,
      step: 7,
      maxSteps: 8,
      modifiedFilesCount: 1,
      hasVerificationResult: false,
      evidence: createEmptyExplorationEvidence(),
    }),
    false,
  );
  assert.equal(
    shouldEnterClosingTurn({
      policy: editPolicy,
      step: editPolicy.explorationBudget,
      maxSteps: 8,
      modifiedFilesCount: 0,
      hasVerificationResult: false,
      evidence: createEmptyExplorationEvidence(),
    }),
    false,
  );
}
