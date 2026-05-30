import assert from "node:assert/strict";
import {
  extractPlanSteps,
  renderFormattedPlan,
} from "../../apps/cli/src/ui/plan-format.js";
import { formatToolFindingLine } from "../../apps/cli/src/ui/agent-output/tool-findings.js";
import { buildRuntimePlan } from "@code-mind/core";

export function runPlanFormatTests(): void {
  const steps = extractPlanSteps(`
## Plan

1. Inspect project structure
2. Find existing auth modules
3. Implement login endpoint
4. Run tests
`);
  assert.equal(steps.length, 4);
  assert.match(steps[0]!, /Inspect project structure/);

  const formatted = renderFormattedPlan(`
- Inspect project structure
- Find existing auth modules
- Implement login endpoint
`);
  assert.match(formatted, /Plan\n  1\. Inspect project structure/);
  assert.match(formatted, /3\. Implement login endpoint/);

  const listFinding = formatToolFindingLine({
    step: 1,
    maxSteps: 10,
    toolCall: { id: "t1", name: "list_dir", arguments: { path: "." } },
    success: true,
    outputPreview: "README.md\npackage.json\napps/\npackages/",
  });
  assert.match(listFinding!, /Found package\.json/);

  const readFinding = formatToolFindingLine({
    step: 2,
    maxSteps: 10,
    toolCall: { id: "t2", name: "read_file", arguments: { path: "README.md" } },
    success: true,
  });
  assert.match(readFinding!, /Found project overview/);

  const testFinding = formatToolFindingLine({
    step: 3,
    maxSteps: 10,
    toolCall: { id: "t3", name: "run_shell", arguments: { command: "pnpm test" } },
    success: true,
    outputPreview: "Tests: 8 passed",
  });
  assert.match(testFinding!, /8 tests passed/);

  const { plan, markdown } = buildRuntimePlan(
    {
      id: "task_plan_artifact",
      text: "Refactor auth middleware",
      cwd: "/tmp/project",
      mode: "plan",
      maxSteps: 6,
    },
    [
      "Refactor auth middleware safely.",
      "",
      "1. Inspect packages/core/src/agent/runtime/tool-call-handler.ts before editing.",
      "2. Modify packages/core/src/agent/runtime/plan-artifact.ts to parse structured plans.",
      "3. Run `pnpm test` and `pnpm build`.",
      "4. Rollback by reverting packages/core/src/agent/runtime/plan-artifact.ts if verification fails.",
    ].join("\n"),
  );
  assert.equal(plan.summary, "Refactor auth middleware safely.");
  assert.equal(plan.riskLevel, "high");
  assert.deepEqual(
    plan.affectedFiles.map((file) => file.path),
    [
      "packages/core/src/agent/runtime/tool-call-handler.ts",
      "packages/core/src/agent/runtime/plan-artifact.ts",
    ],
  );
  assert.equal(plan.affectedFiles[0]?.action, "read");
  assert.equal(plan.affectedFiles[1]?.action, "modify");
  assert.deepEqual(
    plan.verification.map((step) => step.command),
    ["pnpm test", "pnpm build"],
  );
  assert.equal(plan.steps.length, 4);
  assert.ok(plan.steps[1]?.expectedFiles?.includes("packages/core/src/agent/runtime/plan-artifact.ts"));
  assert.ok(plan.rollback);
  assert.match(markdown, /# Plan/);
}
