import type { EvalCompareDelta, EvalRunReport } from "./benchmark-types.js";

export function compareEvalReports(
  baseline: EvalRunReport,
  current: EvalRunReport,
): EvalCompareDelta {
  const baselineById = new Map(baseline.results.map((item) => [item.id, item]));
  const currentById = new Map(current.results.map((item) => [item.id, item]));

  const regressions: string[] = [];
  const improvements: string[] = [];
  const unchanged: string[] = [];

  for (const [id, currentCase] of currentById) {
    const baselineCase = baselineById.get(id);
    if (!baselineCase) {
      continue;
    }
    if (baselineCase.grade.passed && !currentCase.grade.passed) {
      regressions.push(id);
    } else if (!baselineCase.grade.passed && currentCase.grade.passed) {
      improvements.push(id);
    } else {
      unchanged.push(id);
    }
  }

  return {
    baselineRunId: baseline.runId,
    currentRunId: current.runId,
    baselineResolvedRate: baseline.resolvedRate,
    currentResolvedRate: current.resolvedRate,
    resolvedRateDelta: Number((current.resolvedRate - baseline.resolvedRate).toFixed(4)),
    regressions,
    improvements,
    unchanged,
  };
}

export function formatCompareReport(delta: EvalCompareDelta): string {
  return [
    "EVAL COMPARE",
    `baseline=${delta.baselineRunId} resolved=${(delta.baselineResolvedRate * 100).toFixed(1)}%`,
    `current=${delta.currentRunId} resolved=${(delta.currentResolvedRate * 100).toFixed(1)}%`,
    `delta=${delta.resolvedRateDelta >= 0 ? "+" : ""}${(delta.resolvedRateDelta * 100).toFixed(1)}%`,
    "",
    `regressions (${delta.regressions.length}): ${delta.regressions.join(", ") || "none"}`,
    `improvements (${delta.improvements.length}): ${delta.improvements.join(", ") || "none"}`,
  ].join("\n");
}
