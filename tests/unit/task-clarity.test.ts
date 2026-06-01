import assert from "node:assert/strict";
import {
  buildScopeControlGuidance,
  isVagueRepairTask,
  needsScopeControl,
  taskMentionsSpecificPath,
} from "@code-mind/core";

export function runTaskClarityTests(): void {
  assert.equal(isVagueRepairTask("fix test"), true);
  assert.equal(isVagueRepairTask("修复测试失败"), true);
  assert.equal(isVagueRepairTask("测试失败了，帮我看看"), true);
  assert.equal(isVagueRepairTask("fix src/math.ts add function"), false);
  assert.equal(isVagueRepairTask("run npm test and fix failures in src/math.ts"), false);
  assert.equal(taskMentionsSpecificPath("please patch src/math.ts"), true);

  const workspace = "/tmp/demo";
  assert.equal(
    needsScopeControl(
      {
        id: "t1",
        text: "fix test",
        cwd: workspace,
        mode: "agent",
        maxSteps: 12,
      },
      workspace,
    ),
    true,
  );
  assert.equal(
    needsScopeControl(
      {
        id: "t2",
        text: "fix src/math.ts",
        cwd: workspace,
        mode: "agent",
        maxSteps: 12,
      },
      workspace,
    ),
    false,
  );
  assert.equal(
    needsScopeControl(
      {
        id: "t3",
        text: "fix test",
        cwd: workspace,
        mode: "ask",
        maxSteps: 8,
      },
      workspace,
    ),
    false,
  );

  const guidance = buildScopeControlGuidance(
    {
      id: "t4",
      text: "fix test",
      cwd: workspace,
      mode: "agent",
      maxSteps: 12,
    },
    workspace,
    "zh",
  );
  assert.match(guidance, /范围控制/);
  assert.match(guidance, /验证命令/);
}
