import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { loadConfigForModel } from "@code-mind/config";
import { createModelProvider } from "@code-mind/models";
import { createDefaultProfile } from "../ui/prompt.js";
import { createCliAgentLoop } from "../cli/runtime-deps.js";
import { createId } from "@code-mind/shared";
import { nowIso } from "@code-mind/shared";
import type { AgentResult, UserTask } from "@code-mind/shared";
import { resolveBenchmarkMode } from "./benchmark-mode.js";
import {
  applyRecommendedMaxSteps,
  getEffectiveResultStatus,
  isBroadRepoRootTask,
  runAgentSession,
} from "@code-mind/core";

interface BenchmarkCase {
  id: string;
  mode: import("@code-mind/shared").AgentMode;
  workspace: string;
  prompt: string;
  goal: string;
  maxSteps?: number;
  setupFiles?: Array<{
    path: string;
    content: string;
  }>;
}

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

function shouldCopyBenchmarkPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return ![
    "/.git",
    "/.agent",
    "/node_modules",
    "/dist",
    "/coverage",
    "/.DS_Store",
  ].some((segment) => normalized.includes(segment));
}

async function createIsolatedWorkspace(
  sourceWorkspace: string,
  caseId: string,
): Promise<{ workspaceRoot: string; cleanup: () => Promise<void> }> {
  const tempRoot = await mkdtemp(join(tmpdir(), `code-mind-benchmark-${caseId}-`));
  const workspaceRoot = join(tempRoot, basename(sourceWorkspace));
  await cp(sourceWorkspace, workspaceRoot, {
    recursive: true,
    filter: shouldCopyBenchmarkPath,
  });
  return {
    workspaceRoot,
    async cleanup() {
      await rm(tempRoot, { recursive: true, force: true });
    },
  };
}

async function applyBenchmarkSetup(
  workspaceRoot: string,
  files: BenchmarkCase["setupFiles"],
): Promise<void> {
  if (!files || files.length === 0) {
    return;
  }

  for (const file of files) {
    const destination = join(workspaceRoot, file.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.content, "utf8");
  }
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
    const isolated = await createIsolatedWorkspace(sourceWorkspace, item.id);
    try {
      await applyBenchmarkSetup(isolated.workspaceRoot, item.setupFiles);
      const { loop } = await createCliAgentLoop(
        isolated.workspaceRoot,
        provider,
        createDefaultProfile(modelName ?? provider.name, {
          repoRootFocus: item.workspace === ".",
        }),
        {
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
