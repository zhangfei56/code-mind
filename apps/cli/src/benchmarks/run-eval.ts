import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createModelProvider } from "@code-mind/models";
import { nowIso } from "@code-mind/shared";
import { compareEvalReports, formatCompareReport } from "./compare-report.js";
import type { EvalRunReport } from "./benchmark-types.js";
import { loadWorkloadCases, runEvalCase } from "./eval-case-runner.js";
import { buildEvalReport, parseEvalCliOptions, resolveBaselinePath, resolveGitCommit } from "./eval-report.js";

async function main(): Promise<void> {
  const root = resolve(process.cwd());
  const options = parseEvalCliOptions(process.argv.slice(2));
  const workloadPath = join(root, "benchmarks", options.workload);
  const workloadSlug = basename(options.workload, ".json");
  const runId = `${workloadSlug}-${Date.now()}`;
  const outputDir = join(root, ".agent", "benchmarks");
  const baselineDir = join(root, "benchmarks", "baselines");

  const cases = await loadWorkloadCases(root, options.workload);
  const selected = options.caseIds
    ? cases.filter((item) => options.caseIds!.has(item.id))
    : cases;
  if (selected.length === 0) {
    throw new Error("No benchmark cases selected.");
  }

  const config = (await import("@code-mind/config")).loadConfigForModel(options.modelName);
  const provider = createModelProvider(config, options.modelName);
  const modelName = options.modelName ?? provider.name;
  const gitCommit = resolveGitCommit(root);

  const results = [];
  for (const item of selected) {
    console.log(`RUN ${item.id}`);
    const result = await runEvalCase({
      root,
      item,
      provider,
      config,
      modelName,
      maxStepsDefault: options.maxStepsDefault,
    });
    results.push(result);
    console.log(
      `${result.grade.passed ? "PASS" : "FAIL"} ${item.id}  status=${result.status}  steps=${result.steps}  score=${result.grade.score}`,
    );
    for (const check of result.grade.checks.filter((entry) => !entry.passed)) {
      console.log(`  ✗ ${check.id}: ${check.message}`);
    }
  }

  const report = buildEvalReport({
    runId,
    workload: options.workload,
    model: modelName,
    ...(gitCommit ? { gitCommit } : {}),
    maxStepsDefault: options.maxStepsDefault,
    results,
  });

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, `${runId}.json`);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("");
  console.log(`Report saved to ${outputPath}`);
  console.log(
    [
      `resolved=${report.resolved}/${report.total} (${(report.resolvedRate * 100).toFixed(1)}%)`,
      `averageSteps=${report.averageSteps}`,
      `statusStats=${JSON.stringify(report.statusStats)}`,
      `completionStats=${JSON.stringify(report.completionStats)}`,
    ].join("\n"),
  );

  if (options.saveBaseline) {
    await mkdir(baselineDir, { recursive: true });
    const baselineName = `${workloadSlug}-${modelName.replace(/[^a-z0-9_-]+/gi, "-")}.json`;
    const baselinePath = join(baselineDir, baselineName);
    await writeFile(baselinePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Baseline saved to ${baselinePath}`);
  }

  if (options.comparePath) {
    const comparePath = resolve(root, resolveBaselinePath({
      root,
      workloadSlug,
      modelName,
      comparePath: options.comparePath,
    }) ?? options.comparePath);
    const baseline = JSON.parse(await readFile(comparePath, "utf8")) as EvalRunReport;
    const delta = compareEvalReports(baseline, report);
    console.log("");
    console.log(formatCompareReport(delta));
    if (delta.regressions.length > 0) {
      process.exitCode = 2;
    }
  } else if (!options.saveBaseline && report.resolved < report.total) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
