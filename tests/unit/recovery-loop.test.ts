import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLoopPolicy } from "@code-mind/core";
import { runAutomaticVerification, type RunState } from "@code-mind/core";
import { createEmptyExplorationEvidence } from "@code-mind/core";
import type { AgentSession, RuntimeInput, UserTask } from "@code-mind/shared";
import { createTestSessionStore } from "./helpers/session-store.js";

class FakeVerificationPipeline {
  calls = 0;

  async run(): Promise<{
    passed: boolean;
    summary: string;
    steps: Array<{ name: string; success: boolean; output: string }>;
  }> {
    this.calls += 1;
    return {
      passed: this.calls >= 3,
      summary: `attempt ${this.calls}`,
      steps: [{ name: "test", success: this.calls >= 3, output: "" }],
    };
  }
}

export async function runRecoveryLoopTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-recovery-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  const store = createTestSessionStore(workspace);
  const task: UserTask = {
    id: "task_1",
    text: "fix tests",
    cwd: workspace,
    mode: "edit",
    maxSteps: 6,
    metadata: { requestedMaxSteps: 6 },
  };
  const session = await store.create(task, {
    id: "default",
    name: "Default",
    systemPrompt: "demo",
  });
  const strategy = createLoopPolicy(task);
  assert.equal(strategy.maxRecoveryAttempts, 2);

  const pipeline = new FakeVerificationPipeline();
  const runState: RunState = {
    progress: {
      mode: "edit",
      modifiedFiles: new Set(["src/a.ts"]),
      lastCompletedStep: 0,
      closingTurn: false,
      toolCounts: { read: 0, search: 0, edit: 1, shell: 0 },
      lastActivity: "verifying",
    },
    exploration: {
      evidence: createEmptyExplorationEvidence(),
    },
    verification: {
      recoveryAttempts: 0,
    },
    budget: {
      requestedMaxSteps: 6,
      baseMaxSteps: 6,
      extraStepBudget: 0,
    },
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    planMode: { active: false },
    review: { recoveryAttempts: 0 },
  };
  const input: RuntimeInput = {
    task,
    profile: session.profile,
    model: { name: "fake", chat: async () => ({ text: "", finishReason: "stop", raw: {}, toolCalls: [] }), getCapabilities: () => ({ toolCall: true, parallelToolCall: false, jsonSchema: true, vision: false, reasoning: false, maxContextTokens: 100000, maxOutputTokens: 8000, supportsPromptCache: false, supportsComputerUse: false }) },
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await runAutomaticVerification(
      {
        verification: { run: () => pipeline.run("" as never) },
        publish: async () => {},
      },
      store,
      session,
      input,
      runState,
      1,
      strategy,
    );
  }

  assert.equal(pipeline.calls, 3);
  assert.equal(runState.verification.recoveryAttempts, 2);
  const initialMaxSteps = input.task.maxSteps;
  assert.equal(input.task.maxSteps, initialMaxSteps);
  assert.ok(runState.budget.extraStepBudget > 0);
}
