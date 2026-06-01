import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createModelProvider } from "@code-mind/models";
import { compareEvalReports, formatCompareReport } from "./compare-report.js";
import type { EvalRunReport } from "./benchmark-types.js";
import { runEvalCase } from "./eval-case-runner.js";
import {
  buildEvalReport,
  parseEvalCliOptions,
  resolveBaselinePath,
  resolveGitCommit,
} from "./eval-report.js";
import { loadWorkloadCases } from "./load-workload.js";

interface SwebenchPrediction {
  instance_id: string;
  model_name_or_path: string;
  model_patch: string;
}

async function main(): Promise<void> {
  const root = resolve(process.cwd());
  const options = parseEvalCliOptions(process.argv.slice(2));
  const workload = options.workload.includes("swebench")
    ? options.workload
    : "workloads/t2-swebench-dev.json";

  const cases = await loadWorkloadCases(root, workload);
  const selected = options.caseIds
    ? cases.filter((item) => options.caseIds!.has(item.id))
    : cases;
  if (selected.length === 0) {
    throw new Error("No SWE-bench cases selected.");
  }

  const config = (await import("@code-mind/config")).loadConfigForModel(options.modelName);
  const provider = createModelProvider(config, options.modelName);
  const modelName = options.modelName ?? provider.name;
  const workloadSlug = basename(workload, ".json");
  const runId = `${workloadSlug}-${Date.now()}`;
  const gitCommit = resolveGitCommit(root);

  const outputDir = join(root, ".agent", "benchmarks", "swebench");
  await mkdir(outputDir, { recursive: true });
  const runSlug = basename(workload, ".json");
  const predictionsPath = join(outputDir, `${runSlug}-${Date.now()}-predictions.jsonl`);
  await writeFile(predictionsPath, "", "utf8");

  const results = [];
  for (const item of selected) {
    if (!item.swebench) {
      console.warn(`SKIP ${item.id}: missing swebench metadata`);
      continue;
    }
    console.log(`RUN ${item.id} (${item.swebench.instanceId})`);
    const result = await runEvalCase({
      root,
      item: { ...item, maxSteps: item.maxSteps ?? 30 },
      provider,
      config,
      modelName,
      maxStepsDefault: 30,
    });
    results.push(result);

    const prediction: SwebenchPrediction = {
      instance_id: item.swebench.instanceId,
      model_name_or_path: modelName,
      model_patch: result.modelPatch ?? "",
    };
    await appendFile(predictionsPath, `${JSON.stringify(prediction)}\n`, "utf8");

    console.log(
      `${result.grade.passed ? "PASS" : "FAIL"} ${item.id} status=${result.status} steps=${result.steps} patchBytes=${prediction.model_patch.length}`,
    );
  }

  const report = buildEvalReport({
    runId,
    workload,
    model: modelName,
    ...(gitCommit ? { gitCommit } : {}),
    maxStepsDefault: 30,
    results,
  });

  const reportDir = join(root, ".agent", "benchmarks");
  await mkdir(reportDir, { recursive: true });
  const reportPath = join(reportDir, `${runId}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Predictions saved to ${predictionsPath}`);
  console.log(`Report saved to ${reportPath}`);
  console.log(
    `resolved=${report.resolved}/${report.total} (${(report.resolvedRate * 100).toFixed(1)}%)`,
  );
  console.log("Grade patches with official SWE-bench harness: https://github.com/SWE-bench/SWE-bench");

  const baselineDir = join(root, "benchmarks", "baselines");
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
