import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import {
  createRunState,
  finalizeResult,
  syncModifiedFilesFromWorkspace,
  tryReviewRecoveryBeforeCompletion,
} from "@code-mind/core";
import {
  detectPackageManager,
  packageManagerScriptCommand,
} from "@code-mind/verify";
import { createLoopPolicy } from "@code-mind/core";
import { createTestSessionStore } from "./helpers/session-store.js";
import type { AgentResult, AgentSession, RuntimeInput, UserTask } from "@code-mind/shared";

export async function runRuntimeGapFixTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-gap-fix-"));
  writeFileSync(join(workspace, "pnpm-lock.yaml"), "lockfileVersion: 9\n", "utf8");
  writeFileSync(
    join(workspace, "package.json"),
    JSON.stringify({ scripts: { test: "vitest run", build: "tsc -b" } }),
    "utf8",
  );

  assert.equal(detectPackageManager(workspace), "pnpm");
  assert.equal(packageManagerScriptCommand("pnpm", "test"), "pnpm test");
  assert.equal(packageManagerScriptCommand("yarn", "build"), "yarn build");

  const modified = new Set<string>();
  mkdirSync(join(workspace, "src"), { recursive: true });
  execSync("git init", { cwd: workspace, stdio: "ignore" });
  writeFileSync(join(workspace, "src", "new.ts"), "export {}\n", "utf8");
  await syncModifiedFilesFromWorkspace(workspace, modified);
  assert.ok([...modified].some((file) => file.startsWith("src")));

  const task: UserTask = {
    id: "task_1",
    text: "fix",
    cwd: workspace,
    mode: "edit",
    maxSteps: 6,
  };
  const store = createTestSessionStore(workspace);
  const session = await store.create(task, {
    id: "default",
    name: "Default",
    systemPrompt: "demo",
  });
  const strategy = createLoopPolicy(task);
  const runState = createRunState(task);
  runState.progress.modifiedFiles.add("src/a.ts");
  runState.verification.lastVerification = {
    passed: true,
    summary: "ok",
    steps: [{ name: "test", success: true, summary: "passed" }],
  };

  const agentSession = session as AgentSession;
  const input: RuntimeInput = {
    task,
    profile: session.profile,
    model: {
      name: "fake",
      chat: async () => ({ text: "", finishReason: "stop", raw: {}, toolCalls: [] }),
      getCapabilities: () => ({
        toolCall: true,
        parallelToolCall: false,
        jsonSchema: true,
        vision: false,
        reasoning: false,
        maxContextTokens: 100000,
        maxOutputTokens: 8000,
        supportsPromptCache: false,
        supportsComputerUse: false,
      }),
    },
  };

  const passingReview = {
    review: () => ({
      passed: true,
      issues: [],
      suggestions: [],
      requiresAnotherIteration: false,
    }),
  };
  const failingReview = {
    review: () => ({
      passed: false,
      issues: [{ severity: "error" as const, message: "Review blocked completion." }],
      suggestions: [],
      requiresAnotherIteration: true,
    }),
  };

  const first = await tryReviewRecoveryBeforeCompletion(
    { sessionStore: store, review: passingReview, publish: async () => {} },
    { session: agentSession, input, runState, strategy, stepNumber: 3 },
  );
  assert.equal(first, "continue");
  assert.equal(runState.review.recoveryAttempts, 0);

  runState.verification.lastVerification = {
    passed: false,
    summary: "test failed",
    steps: [{ name: "test", success: false, summary: "failed" }],
  };
  const skippedAfterFailedVerify = await tryReviewRecoveryBeforeCompletion(
    { sessionStore: store, review: failingReview, publish: async () => {} },
    { session: agentSession, input, runState, strategy, stepNumber: 3 },
  );
  assert.equal(skippedAfterFailedVerify, "continue");

  runState.verification.lastVerification = {
    passed: true,
    summary: "ok",
    steps: [{ name: "test", success: true, summary: "passed" }],
  };
  const retry = await tryReviewRecoveryBeforeCompletion(
    { sessionStore: store, review: failingReview, publish: async () => {} },
    { session: agentSession, input, runState, strategy, stepNumber: 3 },
  );
  assert.equal(retry, "retry");
  assert.equal(runState.review.recoveryAttempts, 1);
  assert.ok(runState.budget.extraStepBudget > 0);

  runState.review.recoveryAttempts = strategy.maxRecoveryAttempts;
  const exhausted = await tryReviewRecoveryBeforeCompletion(
    { sessionStore: store, review: failingReview, publish: async () => {} },
    { session: agentSession, input, runState, strategy, stepNumber: 4 },
  );
  assert.equal(exhausted, "continue");

  const baseResult: AgentResult = {
    sessionId: session.id,
    runId: "run_1",
    status: "success",
    finalText: "done",
    steps: 4,
    modelName: "fake",
  };
  runState.verification.lastVerification = {
    passed: true,
    summary: "ok",
    steps: [{ name: "test", success: true, summary: "passed" }],
  };
  runState.review.lastReview = {
    passed: false,
    requiresAnotherIteration: true,
    issues: [{ severity: "error", message: "Verification still contains failing commands." }],
    suggestions: [],
  };
  const finalized = finalizeResult(baseResult, runState);
  assert.equal(finalized.metadata?.completion, "review_failed");
  assert.equal(finalized.effectiveStatus, "stopped_by_limit");
}
