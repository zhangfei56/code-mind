import assert from "node:assert/strict";
import {
  shellLooksLikeVerification,
  shouldRunVerifyOnlyAutomaticVerification,
  createLoopPolicy,
  createEmptyExplorationEvidence,
  type RunState,
} from "@code-mind/core";
import type { AgentSession, UserTask } from "@code-mind/shared";

function makeRunState(overrides: Partial<RunState> = {}): RunState {
  return {
    progress: {
      mode: "agent",
      modifiedFiles: new Set<string>(),
      lastCompletedStep: 0,
      closingTurn: false,
      toolCounts: { read: 0, search: 0, edit: 0, shell: 0 },
      lastActivity: "running",
    },
    exploration: { evidence: createEmptyExplorationEvidence() },
    verification: { recoveryAttempts: 0 },
    budget: { requestedMaxSteps: 8, baseMaxSteps: 8, extraStepBudget: 0 },
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    planMode: { active: false },
    review: { recoveryAttempts: 0 },
    ...overrides,
  };
}

function makeSession(mode: UserTask["mode"]): AgentSession {
  return {
    id: "session_test",
    workspaceRoot: "/tmp/demo",
    task: {
      id: "task_test",
      text: "verify tests",
      cwd: "/tmp/demo",
      mode,
      maxSteps: 8,
    },
    profile: { id: "default", name: "Default", systemPrompt: "demo" },
    messages: [],
    status: "running",
    createdAt: "2026-05-31T00:00:00.000Z",
    updatedAt: "2026-05-31T00:00:00.000Z",
  };
}

export function runVerifyOnlyAutomaticVerificationTests(): void {
  assert.equal(
    shellLooksLikeVerification({
      id: "call_1",
      name: "run_shell",
      arguments: { command: "npm test" },
    }),
    true,
  );
  assert.equal(
    shellLooksLikeVerification({
      id: "call_2",
      name: "run_shell",
      arguments: { command: "ls -la" },
    }),
    false,
  );

  const session = makeSession("agent");
  const strategy = createLoopPolicy(session.task);
  assert.equal(
    shouldRunVerifyOnlyAutomaticVerification(session, makeRunState(), strategy),
    true,
  );
  assert.equal(
    shouldRunVerifyOnlyAutomaticVerification(
      makeSession("ask"),
      makeRunState(),
      createLoopPolicy(makeSession("ask").task),
    ),
    false,
  );
  assert.equal(
    shouldRunVerifyOnlyAutomaticVerification(
      session,
      makeRunState({
        progress: {
          mode: "agent",
          modifiedFiles: new Set(["src/a.ts"]),
          lastCompletedStep: 0,
          closingTurn: false,
          toolCounts: { read: 0, search: 0, edit: 1, shell: 0 },
          lastActivity: "editing",
        },
      }),
      strategy,
    ),
    false,
  );
}
