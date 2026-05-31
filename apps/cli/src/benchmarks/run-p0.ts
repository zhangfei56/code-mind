import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadConfigForModel } from "@code-mind/config";
import { createModelProvider } from "@code-mind/models";
import { createDefaultProfile } from "../ui/prompt.js";
import { createCliAgentLoop } from "../cli/runtime-deps.js";
import { createId } from "@code-mind/shared";
import { nowIso } from "@code-mind/shared";
import type { AgentResult, UserTask } from "@code-mind/shared";
import { resolveBenchmarkMode } from "./benchmark-mode.js";
import type { BenchmarkCase } from "./benchmark-types.js";
import { prepareBenchmarkWorkspace } from "./benchmark-workspace.js";
import {
  applyRecommendedMaxSteps,
  getEffectiveResultStatus,
  isBroadRepoRootTask,
  runAgentSession,
} from "@code-mind/core";

interface BenchmarkRunResult {
  id: string;
  workspace: string;
  prompt: string;
  goal: string;
  status: AgentResult["status"];
  steps: number;
  completion?: string;
  phase?: string;
  summary: string;
  sessionId: string;
}

function countBy<T extends string>(values: T[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

async function main(): Promise<void> {
  const root = resolve(process.cwd());
  const workloadFile = process.env.BENCHMARK_WORKLOAD ?? "p0-workload.json";
  const workloadPath = join(root, "benchmarks", workloadFile);
  const outputDir = join(root, ".agent", "benchmarks");
  const workloadSlug = workloadFile.replace(/\.json$/i, "").replace(/[^a-z0-9_-]+/gi, "-");
  const runId = `${workloadSlug}-${Date.now()}`;
  const modelName = process.env.BENCHMARK_MODEL;
  const maxSteps = Number.parseInt(process.env.BENCHMARK_MAX_STEPS ?? "8", 10);

  const raw = await readFile(workloadPath, "utf8");
  const cases = JSON.parse(raw) as BenchmarkCase[];
  const config = loadConfigForModel(modelName);
  const provider = createModelProvider(config, modelName);

  const results: BenchmarkRunResult[] = [];

  for (const item of cases) {
    const sourceWorkspace = resolve(root, item.workspace);
    const isolated = await prepareBenchmarkWorkspace(sourceWorkspace, item);
    try {
      const { loop } = await createCliAgentLoop(
        isolated.workspaceRoot,
        provider,
        createDefaultProfile(modelName ?? provider.name, {
          repoRootFocus: item.workspace === ".",
        }),
        {
          config,
          modelKey: modelName ?? provider.name,
          permissionPrompter: {
            async approve() {
              return { approved: true, approvalId: createId("approval") };
            },
          },
        },
      );
      const task = applyRecommendedMaxSteps(
        {
          id: createId("task"),
          text: item.prompt,
          cwd: isolated.workspaceRoot,
          mode: resolveBenchmarkMode(item),
          maxSteps: item.maxSteps ?? maxSteps,
          requestedModel: modelName ?? provider.name,
          metadata: {
            source: "benchmark",
            benchmarkId: item.id,
            createdAt: nowIso(),
          },
        },
        isolated.workspaceRoot,
      );
      const profile = createDefaultProfile(modelName ?? provider.name, {
        repoRootFocus: isBroadRepoRootTask(task, isolated.workspaceRoot),
      });
      const { result } = await runAgentSession({
        task,
        profile,
        model: provider,
        loop,
        workspaceRoot: isolated.workspaceRoot,
      });
      results.push({
        id: item.id,
        workspace: item.workspace,
        prompt: item.prompt,
        goal: item.goal,
        status: getEffectiveResultStatus(result),
        steps: result.steps,
        summary: result.summary ?? result.finalText,
        sessionId: result.sessionId,
        ...(typeof result.metadata?.completion === "string"
          ? { completion: result.metadata.completion }
          : {}),
        ...(result.metadata?.activitySummary
          ? { activity: result.metadata.activitySummary.last }
          : {}),
      });
    } finally {
      await isolated.cleanup();
    }
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, `${runId}.json`);
  const averageSteps =
    results.length === 0
      ? 0
      : Number(
          (
            results.reduce((sum, item) => sum + item.steps, 0) / results.length
          ).toFixed(2),
        );
  const completionStats = countBy(
    results.map((item) => item.completion ?? "unknown"),
  );
  const statusStats = countBy(results.map((item) => item.status));
  const failureReasonStats = countBy(
    results
      .filter((item) => item.status !== "success")
      .map((item) => item.completion ?? item.status),
  );
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        runId,
        workload: workloadFile,
        model: provider.name,
        maxSteps,
        createdAt: nowIso(),
        total: results.length,
        passed: results.filter((item) => item.status === "success").length,
        averageSteps,
        statusStats,
        completionStats,
        failureReasonStats,
        results,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`Benchmark run saved to ${outputPath}`);
  console.log(
    [
      `total=${results.length}`,
      `passed=${results.filter((item) => item.status === "success").length}`,
      `averageSteps=${averageSteps}`,
      `statusStats=${JSON.stringify(statusStats)}`,
      `completionStats=${JSON.stringify(completionStats)}`,
      `failureReasonStats=${JSON.stringify(failureReasonStats)}`,
    ].join("\n"),
  );
  console.log(
    results
      .map(
        (item) =>
          `${item.id}  ${item.status}  steps=${item.steps}  completion=${item.completion ?? "n/a"}`,
      )
      .join("\n"),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
