import assert from "node:assert/strict";
import type { AgentEvent } from "@code-mind/shared";
import { describeToolIntent } from "../../apps/cli/src/ui/agent-output/tool-intent.js";
import { renderModelIntentLines } from "../../apps/cli/src/ui/agent-output/blocks.js";

export async function runToolIntentTests(): Promise<void> {
  const readImpl = describeToolIntent({
    id: "t1",
    name: "read_file",
    arguments: { path: "docs/architecture/packages.md" },
  });
  assert.match(readImpl, /package map/i);

  const runTests = describeToolIntent({
    id: "t2",
    name: "run_shell",
    arguments: { command: "cd /tmp && pnpm test 2>&1 | tail -80" },
  });
  assert.match(runTests, /Run tests/i);

  const event: AgentEvent = {
    id: "evt_1",
    ts: new Date().toISOString(),
    runId: "run_1",
    sessionId: "s1",
    seq: 1,
    kind: "model.response",
    level: "debug",
    source: { component: "test", surface: "cli" },
    payload: {
      step: 2,
      maxSteps: 12,
      finishReason: "tool_call",
      toolCallCount: 2,
      textPreview: "先读文档了解项目结构，再跑测试定位失败用例。",
      plannedToolCalls: [
        {
          id: "c1",
          name: "read_file",
          arguments: { path: "docs/architecture/packages.md" },
        },
        {
          id: "c2",
          name: "run_shell",
          arguments: { command: "pnpm test" },
        },
      ],
    },
  };

  const intentLines = renderModelIntentLines(event, 1);
  assert.ok(intentLines.some((line) => line === "Why"));
  assert.ok(intentLines.some((line) => line === "Plan"));
  assert.ok(intentLines.some((line) => line.includes("package map")));
  assert.ok(intentLines.some((line) => line.includes("Run tests")));
}
