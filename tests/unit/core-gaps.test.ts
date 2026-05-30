import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestSessionStore } from "./helpers/session-store.js";
import { httpPlanApprovalQueue } from "@code-mind/server-runtime";
import { VerificationPipeline } from "@code-mind/verify";
import {
  createLoopPolicy,
  createEmptyExplorationEvidence,
  deserializeRunState,
  resolvePermission,
  restoreRunStateForSession,
  serializeRunState,
  shouldEnterClosingTurn,
} from "@code-mind/core";

export async function runCoreGapsTests(): Promise<void> {
  const verification = await new VerificationPipeline().run(mkdtempSync(join(tmpdir(), "verify-empty-")));
  assert.equal(verification.passed, false);
  assert.match(verification.summary, /No verification commands detected/);

  const editPolicy = createLoopPolicy({
    id: "task_edit",
    text: "fix",
    cwd: "/tmp/demo",
    mode: "edit",
    maxSteps: 8,
  });
  assert.equal(
    shouldEnterClosingTurn({
      policy: editPolicy,
      step: 7,
      maxSteps: 8,
      modifiedFilesCount: 1,
      hasVerificationResult: true,
      verificationFailed: true,
      evidence: createEmptyExplorationEvidence(),
    }),
    false,
  );

  const denied = await resolvePermission(
    undefined,
    "session_1",
    { id: "call_1", name: "run_shell", arguments: { command: "pnpm test" } },
    { type: "ask", reason: "Command requires approval." },
  );
  assert.equal(denied.allowed, false);
  assert.equal(denied.status, "permission_denied");

  const workspace = mkdtempSync(join(tmpdir(), "code-mind-core-gaps-"));
  const store = createTestSessionStore(workspace);
  const session = await store.create(
    {
      id: "task_1",
      text: "resume me",
      cwd: workspace,
      mode: "edit",
      maxSteps: 6,
    },
    { id: "default", name: "Default", systemPrompt: "test" },
  );
  const persisted = serializeRunState({
    progress: {
      mode: "edit",
      modifiedFiles: new Set(["src/a.ts"]),
      lastCompletedStep: 2,
      closingTurn: false,
      toolCounts: { read: 2, search: 1, edit: 1, shell: 0 },
      lastActivity: "editing",
    },
    exploration: { evidence: createEmptyExplorationEvidence() },
    verification: { recoveryAttempts: 1 },
    budget: {
      requestedMaxSteps: 6,
      baseMaxSteps: 6,
      extraStepBudget: 2,
    },
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    planMode: { active: false },
    review: { recoveryAttempts: 0 },
  });
  await store.saveRunState(session.id, persisted);
  const restored = deserializeRunState(
    {
      id: "task_1",
      text: "resume me",
      cwd: workspace,
      mode: "edit",
      maxSteps: 6,
    },
    persisted,
  );
  assert.equal(restored.progress.modifiedFiles.has("src/a.ts"), true);
  assert.equal(restored.budget.extraStepBudget, 2);
  assert.equal(restored.kernel.maxSteps, 8);
  assert.equal(restored.kernel.phase, "initializing");

  const restoredFromInvalidKernel = deserializeRunState(
    {
      id: "task_1",
      text: "resume me",
      cwd: workspace,
      mode: "edit",
      maxSteps: 6,
    },
    {
      ...persisted,
      kernel: {
        phase: "unknown",
        step: 99,
        maxSteps: 0,
        closingTurn: "no",
        pendingToolCalls: -1,
        checkpointRequired: "yes",
      },
    } as unknown as typeof persisted,
  );
  assert.equal(restoredFromInvalidKernel.kernel.maxSteps, 8);
  assert.equal(restoredFromInvalidKernel.kernel.step, 2);
  assert.equal(restoredFromInvalidKernel.kernel.phase, "initializing");
  assert.equal(restoredFromInvalidKernel.kernel.pendingToolCalls, 0);

  const persistedWithoutExtraBudget = serializeRunState({
    ...restored,
    budget: {
      requestedMaxSteps: 6,
      baseMaxSteps: 6,
      extraStepBudget: 0,
    },
  });
  await store.saveRunState(session.id, persistedWithoutExtraBudget);
  await store.updateManifest(session.id, { effectiveMaxSteps: 10 });
  const restoredFromSession = await restoreRunStateForSession(store, session.id, {
    id: "task_1",
    text: "resume me",
    cwd: workspace,
    mode: "edit",
    maxSteps: 6,
  });
  assert.equal(restoredFromSession.budget.extraStepBudget, 4);
  assert.equal(restoredFromSession.kernel.maxSteps, 10);

  let cancelled = false;
  const controller = new AbortController();
  const pending = httpPlanApprovalQueue.waitForApproval(
    { planSessionId: "plan_session_abort_test", planText: "do work" },
    { abortSignal: controller.signal },
  );
  controller.abort();
  cancelled = await pending;
  assert.equal(cancelled, false);
}
