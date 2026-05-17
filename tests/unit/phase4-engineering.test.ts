import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PlanManager } from "../../src/engineering/plan-manager.js";
import { DefaultTestRunner } from "../../src/engineering/test-runner.js";
import { LspAdapter } from "../../src/engineering/lsp-adapter.js";
import { ReviewEngine } from "../../src/engineering/review-engine.js";
import { GitManager } from "../../src/engineering/git-manager.js";
import { WorktreeManager } from "../../src/engineering/worktree-manager.js";
import { EngineeringOrchestrator } from "../../src/engineering/engineer.js";
import { AgentRuntime } from "../../src/agent/runtime.js";
import type {
  AgentProfile,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  UserTask,
} from "../../src/shared/types.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

class NoopProvider implements ModelProvider {
  name = "fake";

  async chat(_request: ModelRequest): Promise<ModelResponse> {
    return {
      text: "done",
      finishReason: "stop",
      raw: {},
      toolCalls: [],
    };
  }

  getCapabilities(): ModelCapabilities {
    return {
      toolCall: true,
      parallelToolCall: false,
      jsonSchema: true,
      vision: false,
      reasoning: false,
      maxContextTokens: 100000,
      maxOutputTokens: 8000,
      supportsPromptCache: false,
      supportsComputerUse: false,
    };
  }
}

export async function runPhase4EngineeringTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-phase4-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  mkdirSync(join(workspace, "tests"), { recursive: true });
  writeFileSync(
    join(workspace, "package.json"),
    JSON.stringify({
      name: "phase4-demo",
      private: true,
      type: "module",
      scripts: {
        test: "node test.js",
      },
    }),
    "utf8",
  );
  writeFileSync(
    join(workspace, "src", "math.ts"),
    "export function add(a: number, b: number): number {\n  return a + b;\n}\n",
    "utf8",
  );
  writeFileSync(
    join(workspace, "test.js"),
    "console.log('tests passed')\n",
    "utf8",
  );
  writeFileSync(
    join(workspace, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        module: "ES2020",
        strict: true,
      },
      include: ["src/**/*.ts"],
    }),
    "utf8",
  );

  const planManager = new PlanManager();
  const plan = planManager.createPlan("重构 auth 模块，把 token 校验逻辑拆出来", workspace);
  assert.equal(plan.steps.length, 3);
  assert.match(planManager.renderMarkdown(plan), /修改计划/);
  assert.equal(planManager.createPatchPlan(plan).patches.length, 3);

  const testRunner = new DefaultTestRunner();
  const profile = await testRunner.detect(workspace);
  assert.equal(profile.language, "typescript");
  assert.equal(profile.commands.test, "npm test");

  const summary = await testRunner.parseOutput(
    "Expected: 3\nReceived: -1\nsrc/math.ts\ntests/math.test.ts",
  );
  assert.equal(summary.failedTests[0]?.expected, "3");
  assert.equal(summary.failedTests[0]?.received, "-1");
  assert.ok(summary.likelyFiles.includes("src/math.ts"));

  const diagnosticsWorkspace = mkdtempSync(join(tmpdir(), "code-mind-phase4-ts-"));
  mkdirSync(join(diagnosticsWorkspace, "src"), { recursive: true });
  writeFileSync(
    join(diagnosticsWorkspace, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        module: "ES2020",
        strict: true,
      },
      include: ["src/**/*.ts"],
    }),
    "utf8",
  );
  writeFileSync(
    join(diagnosticsWorkspace, "src", "main.ts"),
    'const x: number = "abc";\n',
    "utf8",
  );
  const diagnostics = await new LspAdapter().diagnostics(diagnosticsWorkspace);
  assert.ok(diagnostics.some((item) => /not assignable to type 'number'/i.test(item.message)));

  const review = new ReviewEngine().review({
    task: "修复 math 模块",
    changedFiles: ["src/math.ts"],
    diff: "diff --git a/src/math.ts b/src/math.ts",
    testResults: [],
  });
  assert.ok(review.issues.some((issue) => /test/i.test(issue.message)));

  git(workspace, ["init"]);
  git(workspace, ["config", "user.email", "test@example.com"]);
  git(workspace, ["config", "user.name", "Test User"]);
  git(workspace, ["add", "."]);
  git(workspace, ["commit", "-m", "init"]);
  writeFileSync(join(workspace, "src", "math.ts"), "export const value = 1;\n", "utf8");

  const gitManager = new GitManager();
  const status = await gitManager.status(workspace);
  assert.equal(status.clean, false);
  assert.ok(status.modified.includes("src/math.ts"));
  assert.match(await gitManager.diff(workspace), /value = 1/);
  assert.match(await gitManager.log(workspace, 1), /init/);
  assert.match(await gitManager.show(workspace), /init/);
  await gitManager.restoreFile(workspace, "src/math.ts");
  assert.match(readFileSync(join(workspace, "src", "math.ts"), "utf8"), /return a \+ b/);

  const worktreeManager = new WorktreeManager();
  const worktree = await worktreeManager.create(workspace, "task_1");
  assert.ok(readdirSync(join(workspace, ".agent", "worktrees")).includes("task_1"));
  writeFileSync(join(worktree.path, "src", "math.ts"), "export const value = 2;\n", "utf8");
  assert.match(await worktreeManager.diff(worktree.path), /value = 2/);
  await worktreeManager.cleanup(workspace, "task_1");

  const engineeringWorkspace = mkdtempSync(join(tmpdir(), "code-mind-phase4-plan-"));
  mkdirSync(join(engineeringWorkspace, "src"), { recursive: true });
  writeFileSync(join(engineeringWorkspace, "src", "a.ts"), "export const a = 1;\n", "utf8");
  const runtime = new AgentRuntime();
  const engineeringTask: UserTask = {
    id: "task_plan",
    text: "重构 auth 模块",
    cwd: engineeringWorkspace,
    mode: "plan",
    maxSteps: 4,
  };
  const engineeringProfile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "You are a code agent.",
  };
  const result = await new EngineeringOrchestrator().run({
    task: engineeringTask,
    profile: engineeringProfile,
    model: new NoopProvider(),
    runtime,
    workspaceRoot: engineeringWorkspace,
    planOnly: true,
  });
  assert.ok(result.plan);
  const sessionDir = join(engineeringWorkspace, ".agent", "sessions", result.sessionId);
  assert.match(readFileSync(join(sessionDir, "plan.md"), "utf8"), /修改计划/);
  assert.match(readFileSync(join(sessionDir, "task-state.json"), "utf8"), /awaiting_approval/);
}
