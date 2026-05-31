import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentResult } from "@code-mind/shared";
import type { BenchmarkCase } from "../../apps/cli/src/benchmarks/benchmark-types.js";
import { compareEvalReports, formatCompareReport } from "../../apps/cli/src/benchmarks/compare-report.js";
import { gradeBenchmarkCase } from "../../apps/cli/src/benchmarks/graders.js";

function makeResult(overrides: Partial<AgentResult> = {}): AgentResult {
  return {
    sessionId: "session_test",
    runId: "",
    status: "success",
    finalText: "done",
    steps: 3,
    modelName: "fake",
    ...overrides,
  };
}

export async function runBenchmarkGraderTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-grader-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  writeFileSync(join(workspace, "package.json"), '{"type":"module"}\n', "utf8");
  writeFileSync(join(workspace, "src", "math.ts"), "export function add(a,b){return a+b;}\n", {
    flag: "w",
  });
  writeFileSync(
    join(workspace, "test.js"),
    'import assert from "node:assert/strict";\nassert.equal(1+1,2);\n',
    "utf8",
  );

  const passing = await gradeBenchmarkCase({
    item: {
      id: "verify-pass",
      mode: "agent",
      workspace: ".",
      prompt: "x",
      goal: "x",
      graders: { verifyCommand: "node test.js" },
    },
    workspaceRoot: workspace,
    result: makeResult(),
  });
  assert.equal(passing.passed, true);

  writeFileSync(
    join(workspace, "test.js"),
    'import assert from "node:assert/strict";\nassert.equal(1+1,3);\n',
    "utf8",
  );
  const failing = await gradeBenchmarkCase({
    item: {
      id: "verify-fail",
      mode: "agent",
      workspace: ".",
      prompt: "x",
      goal: "x",
      graders: { verifyCommand: "node test.js" },
    },
    workspaceRoot: workspace,
    result: makeResult({ status: "success" }),
  });
  assert.equal(failing.passed, false, "agent success must not override failing tests");

  const shellPass = await gradeBenchmarkCase({
    item: {
      id: "verify-shell-chain",
      mode: "agent",
      workspace: ".",
      prompt: "x",
      goal: "x",
      graders: {
        verifyCommand: `${process.execPath} -e "process.exit(0)" && ${process.execPath} -e "process.exit(0)"`,
      },
    },
    workspaceRoot: workspace,
    result: makeResult(),
  });
  assert.equal(shellPass.passed, true, "compound verify commands must run via shell");

  const steps = await gradeBenchmarkCase({
    item: {
      id: "max-steps",
      mode: "ask",
      workspace: ".",
      prompt: "x",
      goal: "x",
      graders: { maxSteps: 4 },
    },
    workspaceRoot: workspace,
    result: makeResult({ steps: 6 }),
  });
  assert.equal(steps.passed, false);

  const baseline = {
    runId: "base",
    workload: "workloads/t1-micro.json",
    model: "fake",
    maxStepsDefault: 10,
    createdAt: "t",
    total: 2,
    resolved: 1,
    resolvedRate: 0.5,
    averageSteps: 4,
    statusStats: {},
    completionStats: {},
    failureReasonStats: {},
    results: [
      {
        id: "a",
        workspace: ".",
        prompt: "",
        goal: "",
        status: "success",
        steps: 3,
        summary: "",
        sessionId: "s1",
        runId: "r1",
        grade: { passed: true, score: 1, checks: [] },
      },
      {
        id: "b",
        workspace: ".",
        prompt: "",
        goal: "",
        status: "failed",
        steps: 5,
        summary: "",
        sessionId: "s2",
        runId: "r2",
        grade: { passed: false, score: 0, checks: [] },
      },
    ],
  };
  const current = {
    ...baseline,
    runId: "current",
    resolved: 2,
    resolvedRate: 1,
    results: baseline.results.map((item) => ({
      ...item,
      grade: { passed: true, score: 1, checks: [] },
    })),
  };
  const delta = compareEvalReports(baseline, current);
  assert.deepEqual(delta.improvements, ["b"]);
  assert.deepEqual(delta.regressions, []);
  assert.match(formatCompareReport(delta), /improvements \(1\): b/);
}
