import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRunKernelState,
  createRunState,
  normalizeKernelStateForResume,
  ResultBuilder,
  transitionRunKernelState,
  serializeRunState,
} from "@code-mind/core";
import { completeRun, runAutomaticVerification } from "@code-mind/core";
import { createLoopPolicy } from "@code-mind/core";
import type { RuntimeInput, UserTask } from "@code-mind/shared";
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
      passed: false,
      summary: `attempt ${this.calls}`,
      steps: [{ name: "test", success: false, output: "failed" }],
    };
  }
}

export async function runRecoveryResumeHardeningTests(): Promise<void> {
  const fallback = createRunKernelState({ maxSteps: 3, step: 1 });
  const normalizedTerminal = normalizeKernelStateForResume(
    { ...fallback, phase: "completed", pendingToolCalls: 0 },
    fallback,
  );
  assert.equal(normalizedTerminal.phase, "recovering");
  assert.equal(normalizedTerminal.pendingToolCalls, 0);

  const normalizedMismatch = normalizeKernelStateForResume(
    {
      ...fallback,
      phase: "awaiting_approval",
      pendingToolCalls: 0,
    },
    fallback,
  );
  assert.equal(normalizedMismatch.phase, "assembling_prompt");
  assert.equal(normalizedMismatch.pendingToolCalls, 0);

  const normalizedOrphanPending = normalizeKernelStateForResume(
    {
      ...fallback,
      phase: "calling_model",
      pendingToolCalls: 2,
    },
    fallback,
  );
  assert.equal(normalizedOrphanPending.pendingToolCalls, 0);

  const workspace = mkdtempSync(join(tmpdir(), "code-mind-recovery-resume-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  const store = createTestSessionStore(workspace);
  const task: UserTask = {
    id: "task_recovery",
    text: "fix tests",
    cwd: workspace,
    mode: "edit",
    maxSteps: 6,
  };
  const session = await store.create(task, {
    id: "default",
    name: "Default",
    systemPrompt: "demo",
  });
  const runState = createRunState(task);
  const toolRouted = transitionRunKernelState(runState.kernel, {
    type: "step_started",
    step: 1,
    maxSteps: 6,
    closingTurn: false,
  });
  runState.kernel = transitionRunKernelState(toolRouted.state, {
    type: "prompt_assembled",
  }).state;
  runState.kernel = transitionRunKernelState(runState.kernel, {
    type: "model_response_received",
    response: {
      text: "",
      toolCalls: [{ id: "call_1", name: "apply_patch", arguments: {} }],
      finishReason: "tool_calls",
    },
    enterClosingTurn: false,
  }).state;
  assert.equal(runState.kernel.phase, "handling_tools");

  const strategy = createLoopPolicy(task);
  const pipeline = new FakeVerificationPipeline();
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

  const checkpointPort = {
    checkpoint: async (state: typeof runState) => {
      await store.saveRunState(session.id, serializeRunState(state));
    },
  };

  await runAutomaticVerification(
    {
      verification: { run: () => pipeline.run("" as never) },
      publish: async () => {},
      checkpointPort,
    },
    store,
    session,
    input,
    runState,
    1,
    strategy,
  );
  assert.equal(runState.kernel.phase, "recovering");
  assert.equal(runState.verification.recoveryAttempts, 1);

  const resultBuilder = new ResultBuilder();
  const cancelled = resultBuilder.cancelled(session.id, "fake", 1);
  const lifecycleDeps = {
    publish: async () => {},
    setSessionStatus: async () => {},
    review: {
      review: () => ({
        requiresAnotherIteration: false,
        issues: [],
        suggestions: [],
        passed: true,
      }),
    },
  };
  await completeRun(
    lifecycleDeps,
    store,
    session,
    cancelled,
    input,
    runState,
    { checkpointPort },
  );
  const persisted = await store.readRunState(session.id);
  assert.equal(persisted?.kernel?.phase, "cancelled");

  const completedRunState = createRunState(task);
  const success = resultBuilder.success(session.id, "fake", 1, "done");
  await completeRun(
    lifecycleDeps,
    store,
    session,
    success,
    input,
    completedRunState,
    { checkpointPort },
  );
  const completedPersisted = await store.readRunState(session.id);
  assert.equal(completedPersisted?.kernel?.phase, "completed");
}
