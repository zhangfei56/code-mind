import type { AgentSession, RuntimeInput, ToolCall } from "@code-mind/shared";
import { createId, nowIso } from "@code-mind/shared";
import type { SessionStorePort } from "./ports/session-store-port.js";
import { EDIT_AGENT_VERIFY_OPTIONS } from "@code-mind/verify";
import type { VerificationPort, RunKernelPorts } from "../kernel/ports.js";
import { markVerificationCommandKnown } from "./exploration-evidence.js";
import type { LoopPolicy } from "../task-strategy.js";
import type { RunState } from "./run-state.js";
import { getEffectiveMaxSteps } from "./run-state.js";
import { summarizeVerification } from "./helpers.js";
import { applyRunKernelEventAndCheckpoint, runKernelCheckpointOptions } from "./kernel-runtime.js";
import { setActivity } from "./run-facts.js";
import {
  activityUpdatedEvent,
  messageUserEvent,
  recoveryTriggeredEvent,
  verificationFinishedEvent,
  verificationStartedEvent,
} from "./agent-events.js";

export interface VerificationRunnerDeps {
  verification: VerificationPort;
  publish: (
    input: RuntimeInput | undefined,
    event: import("@code-mind/shared").AgentEventInput,
  ) => Promise<void>;
  checkpointPort: RunKernelPorts["stateStore"];
}

export async function runAutomaticVerification(
  deps: VerificationRunnerDeps,
  sessionStore: SessionStorePort,
  session: AgentSession,
  input: RuntimeInput,
  runState: RunState,
  stepNumber: number,
  strategy: LoopPolicy,
): Promise<void> {
  const verificationId = createId("verify");
  const checkpointOptions = runKernelCheckpointOptions(input, deps.checkpointPort);

  if (runState.kernel) {
    await applyRunKernelEventAndCheckpoint(
      session,
      runState,
      { type: "verification_started" },
      checkpointOptions,
    );
  }

  await deps.publish(
    input,
    verificationStartedEvent({
      step: stepNumber,
      maxSteps: getEffectiveMaxSteps(runState),
      verificationId,
      cwd: session.task.cwd,
    }),
  );

  const verification = await deps.verification.run(
    session.task.cwd,
    EDIT_AGENT_VERIFY_OPTIONS,
  );
  markVerificationCommandKnown(runState.exploration.evidence);
  runState.verification.lastVerification = verification;
  if (runState.kernel) {
    await applyRunKernelEventAndCheckpoint(
      session,
      runState,
      { type: "verification_finished", passed: verification.passed },
      checkpointOptions,
    );
  }
  const output = summarizeVerification(verification);
  const resultMessage = verification.passed
    ? `[Verification passed]\n${output}`
    : `[Verification failed]\n${output}`;

  session.messages.push({
    id: createId("msg"),
    role: "user",
    content: resultMessage,
    createdAt: nowIso(),
  });
  await deps.publish(input, messageUserEvent(resultMessage));

  if (
    !verification.passed &&
    runState.verification.recoveryAttempts < strategy.maxRecoveryAttempts
  ) {
    runState.verification.recoveryAttempts += 1;
    const extraSteps = Math.min(
      3,
      Math.max(2, Math.floor(runState.budget.baseMaxSteps * 0.25)),
    );
    runState.budget.extraStepBudget += extraSteps;
    if (runState.kernel) {
      runState.kernel.maxSteps = getEffectiveMaxSteps(runState);
      await applyRunKernelEventAndCheckpoint(
        session,
        runState,
        { type: "recovery_requested" },
        checkpointOptions,
      );
    }
    await deps.publish(
      input,
      recoveryTriggeredEvent({
        source: "verification",
        attempt: runState.verification.recoveryAttempts,
        maxAttempts: strategy.maxRecoveryAttempts,
        step: stepNumber,
      }),
    );
    const recoveryHint = `Verification failed (recovery ${runState.verification.recoveryAttempts}/${strategy.maxRecoveryAttempts}). Read the relevant files and fix these issues before finishing:\n${verification.summary}`;
    session.messages.push({
      id: createId("msg"),
      role: "user",
      content: recoveryHint,
      createdAt: nowIso(),
    });
    await deps.publish(input, messageUserEvent(recoveryHint));
  }

  await sessionStore.saveVerification(session.id, verification);
  await deps.publish(
    input,
    verificationFinishedEvent({
      step: stepNumber,
      maxSteps: getEffectiveMaxSteps(runState),
      verificationId,
      passed: verification.passed,
      summary: verification.summary,
      ...(verification.passed ? {} : { error: verification.summary }),
    }),
  );
}

const VERIFY_SHELL_COMMAND_PATTERN =
  /\b(npm test|pnpm test|yarn test|node test|pytest|cargo test|go test|vitest|jest)\b/i;

export function shellLooksLikeVerification(toolCall: ToolCall): boolean {
  if (toolCall.name !== "run_shell") {
    return false;
  }
  const command =
    typeof toolCall.arguments.command === "string" ? toolCall.arguments.command : "";
  return VERIFY_SHELL_COMMAND_PATTERN.test(command);
}

export function shouldRunVerifyOnlyAutomaticVerification(
  session: AgentSession,
  runState: RunState,
  strategy: LoopPolicy,
): boolean {
  if (session.task.mode !== "agent" && session.task.mode !== "edit") {
    return false;
  }
  if (runState.progress.modifiedFiles.size > 0) {
    return false;
  }
  if (runState.verification.lastVerification !== undefined) {
    return false;
  }
  return strategy.autoVerifyAfterPatch;
}

export async function runVerifyOnlyAutomaticVerificationIfNeeded(
  deps: VerificationRunnerDeps,
  sessionStore: SessionStorePort,
  session: AgentSession,
  input: RuntimeInput,
  runState: RunState,
  stepNumber: number,
  strategy: LoopPolicy,
): Promise<boolean> {
  if (!shouldRunVerifyOnlyAutomaticVerification(session, runState, strategy)) {
    return false;
  }

  setActivity(runState.progress, "verifying");
  await deps.publish(input, activityUpdatedEvent("verifying", undefined, stepNumber));
  await runAutomaticVerification(
    deps,
    sessionStore,
    session,
    input,
    runState,
    stepNumber,
    strategy,
  );
  if (runState.verification.lastVerification?.passed) {
    setActivity(runState.progress, "summarizing");
  } else {
    setActivity(runState.progress, "running");
  }
  return true;
}
