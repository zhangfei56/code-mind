import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { loadConfigForModel } from "@code-mind/config";
import {
  applyRecommendedMaxSteps,
  getEffectiveResultStatus,
  isBroadRepoRootTask,
  runAgentSession,
} from "@code-mind/core";
import { createModelProvider } from "@code-mind/models";
import { createId, nowIso } from "@code-mind/shared";
import { createCliAgentLoop } from "../cli/runtime-deps.js";
import { createDefaultProfile } from "../ui/prompt.js";
import { resolveBenchmarkMode } from "./benchmark-mode.js";
import type { BenchmarkCase } from "./benchmark-types.js";
import { prepareBenchmarkWorkspace } from "./benchmark-workspace.js";
import { gradeBenchmarkCase } from "./graders.js";
import { loadWorkloadCases } from "./load-workload.js";
import {
  preparePolyglotWorkspace,
  prepareProductCaseWorkspace,
} from "./polyglot-workspace.js";
import { captureWorkspacePatch, prepareSwebenchWorkspace } from "./swebench-workspace.js";

const execFileAsync = promisify(execFile);

async function runPrepareCommand(workspaceRoot: string, command: string | undefined): Promise<void> {
  if (!command?.trim()) {
    return;
  }
  await execFileAsync("bash", ["-lc", command], {
    cwd: workspaceRoot,
    env: process.env,
    timeout: 300_000,
  });
}

export interface EvalCaseRunResult {
  id: string;
  workspace: string;
  prompt: string;
  goal: string;
  status: ReturnType<typeof getEffectiveResultStatus>;
  steps: number;
  completion?: string;
  summary: string;
  sessionId: string;
  runId: string;
  grade: Awaited<ReturnType<typeof gradeBenchmarkCase>>;
  modelPatch?: string;
}

async function runEvalCase(input: {
  root: string;
  item: BenchmarkCase;
  provider: ReturnType<typeof createModelProvider>;
  config: ReturnType<typeof loadConfigForModel>;
  modelName: string;
  maxStepsDefault: number;
}): Promise<EvalCaseRunResult> {
  let workspaceRoot = "";
  let cleanup = async () => {};
  let prompt = input.item.prompt;
  let graders = input.item.graders;

  if (input.item.polyglot) {
    const prepared = await preparePolyglotWorkspace(input.root, input.item, input.item.polyglot);
    workspaceRoot = prepared.workspaceRoot;
    cleanup = prepared.cleanup;
    prompt = prepared.prompt;
    graders = prepared.graders;
  } else if (input.item.productCase) {
    const prepared = await prepareProductCaseWorkspace(
      input.root,
      input.item,
      input.item.productCase,
    );
    workspaceRoot = prepared.workspaceRoot;
    cleanup = prepared.cleanup;
    prompt = prepared.prompt;
  } else if (input.item.swebench) {
    const prepared = await prepareSwebenchWorkspace(input.root, input.item, input.item.swebench);
    workspaceRoot = prepared.workspaceRoot;
    cleanup = prepared.cleanup;
    prompt = prepared.prompt;
  } else {
    const sourceWorkspace = resolve(input.root, input.item.workspace);
    const prepared = await prepareBenchmarkWorkspace(sourceWorkspace, input.item);
    workspaceRoot = prepared.workspaceRoot;
    cleanup = prepared.cleanup;
  }

  try {
    await runPrepareCommand(workspaceRoot, input.item.prepareCommand);
    const { loop } = await createCliAgentLoop(
      workspaceRoot,
      input.provider,
      createDefaultProfile(input.modelName, {
        repoRootFocus: input.item.workspace === ".",
      }),
      {
        config: input.config,
        modelKey: input.modelName,
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
        text: prompt,
        cwd: workspaceRoot,
        mode: resolveBenchmarkMode(input.item),
        maxSteps: input.item.maxSteps ?? input.maxStepsDefault,
        requestedModel: input.modelName,
        metadata: {
          source: "benchmark",
          benchmarkId: input.item.id,
          createdAt: nowIso(),
        },
      },
      workspaceRoot,
    );
    const profile = createDefaultProfile(input.modelName, {
      repoRootFocus: isBroadRepoRootTask(task, workspaceRoot),
    });
    const { result } = await runAgentSession({
      task,
      profile,
      model: input.provider,
      loop,
      workspaceRoot,
    });
    const grade = await gradeBenchmarkCase({
      item: input.item,
      workspaceRoot,
      result,
      ...(graders ? { graders } : {}),
    });
    const modelPatch = input.item.swebench ? await captureWorkspacePatch(workspaceRoot) : undefined;
    return {
      id: input.item.id,
      workspace: input.item.workspace,
      prompt,
      goal: input.item.goal,
      status: getEffectiveResultStatus(result),
      steps: result.steps,
      summary: result.summary ?? result.finalText,
      sessionId: result.sessionId,
      runId: result.runId,
      ...(typeof result.metadata?.completion === "string"
        ? { completion: result.metadata.completion }
        : {}),
      grade,
      ...(modelPatch !== undefined ? { modelPatch } : {}),
    };
  } finally {
    await cleanup();
  }
}

export { runEvalCase, runPrepareCommand, loadWorkloadCases };
