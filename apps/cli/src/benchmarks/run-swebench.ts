import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createModelProvider } from "@code-mind/models";
import { runEvalCase } from "./eval-case-runner.js";
import { parseEvalCliOptions } from "./eval-report.js";
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

  const outputDir = join(root, ".agent", "benchmarks", "swebench");
  await mkdir(outputDir, { recursive: true });
  const runSlug = basename(workload, ".json");
  const predictionsPath = join(outputDir, `${runSlug}-${Date.now()}-predictions.jsonl`);
  await writeFile(predictionsPath, "", "utf8");

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

  console.log(`Predictions saved to ${predictionsPath}`);
  console.log("Grade with official SWE-bench harness: https://github.com/SWE-bench/SWE-bench");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
