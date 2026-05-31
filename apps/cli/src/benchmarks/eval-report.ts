import { execFileSync } from "node:child_process";
import type { EvalCaseResult, EvalRunReport } from "./benchmark-types.js";

export interface EvalCliOptions {
  workload: string;
  comparePath?: string;
  saveBaseline: boolean;
  caseIds?: Set<string>;
  modelName?: string | undefined;
  maxStepsDefault: number;
}

function countBy<T extends string>(values: T[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

export function parseEvalCliOptions(argv: string[]): EvalCliOptions {
  const options: EvalCliOptions = {
    workload: process.env.BENCHMARK_WORKLOAD ?? "workloads/t1-micro.json",
    saveBaseline: process.env.EVAL_SAVE_BASELINE === "1",
    maxStepsDefault: Number.parseInt(process.env.BENCHMARK_MAX_STEPS ?? "10", 10),
    modelName: process.env.BENCHMARK_MODEL,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--workload" && argv[index + 1]) {
      options.workload = argv[index + 1]!;
      index += 1;
      continue;
    }
    if (arg === "--compare" && argv[index + 1]) {
      options.comparePath = argv[index + 1]!;
      index += 1;
      continue;
    }
    if (arg === "--save-baseline") {
      options.saveBaseline = true;
      continue;
    }
    if (arg === "--ids" && argv[index + 1]) {
      options.caseIds = new Set(
        argv[index + 1]!.split(",").map((entry) => entry.trim()).filter(Boolean),
      );
      index += 1;
      continue;
    }
    if (arg === "--model" && argv[index + 1]) {
      options.modelName = argv[index + 1];
      index += 1;
    }
  }

  return options;
}

export function resolveGitCommit(root: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  } catch {
    return undefined;
  }
}

export function buildEvalReport(input: {
  runId: string;
  workload: string;
  model: string;
  gitCommit?: string;
  maxStepsDefault: number;
  results: EvalCaseResult[];
}): EvalRunReport {
  const resolved = input.results.filter((item) => item.grade.passed).length;
  const averageSteps =
    input.results.length === 0
      ? 0
      : Number(
          (
            input.results.reduce((sum, item) => sum + item.steps, 0) / input.results.length
          ).toFixed(2),
        );

  return {
    runId: input.runId,
    workload: input.workload,
    model: input.model,
    ...(input.gitCommit ? { gitCommit: input.gitCommit } : {}),
    maxStepsDefault: input.maxStepsDefault,
    createdAt: new Date().toISOString(),
    total: input.results.length,
    resolved,
    resolvedRate:
      input.results.length === 0
        ? 0
        : Number((resolved / input.results.length).toFixed(4)),
    averageSteps,
    statusStats: countBy(input.results.map((item) => item.status)),
    completionStats: countBy(input.results.map((item) => item.completion ?? "unknown")),
    failureReasonStats: countBy(
      input.results
        .filter((item) => !item.grade.passed)
        .map((item) => item.completion ?? item.status),
    ),
    results: input.results,
  };
}
