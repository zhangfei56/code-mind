import type {
  AgentSession,
  ReviewResult,
  RuntimeInput,
  TestResult,
  VerificationStepResult,
} from "@code-mind/shared";
import { createId, nowIso } from "@code-mind/shared";
import { DiffManager } from "@code-mind/workspace";
import type { SessionStorePort } from "./ports/session-store-port.js";
import type { ReviewPort } from "../kernel/ports.js";
import type { LoopPolicy } from "../task-strategy.js";
import type { RunState } from "./run-state.js";
import { getEffectiveMaxSteps } from "./run-state.js";
import { syncModifiedFilesFromWorkspace } from "./change-tracking.js";
import { messageUserEvent, recoveryTriggeredEvent } from "./agent-events.js";

function verificationStepToTestResult(step: VerificationStepResult): TestResult {
  return {
    success: step.success,
    command: step.command ?? step.name,
    exitCode: step.exitCode ?? (step.success ? 0 : 1),
    durationMs: step.durationMs ?? 0,
    stdout: step.success ? step.summary : "",
    stderr: step.success ? "" : step.summary,
    summary: {
      failedTests: [],
      errorMessages: step.success ? [] : [step.summary],
      likelyFiles: [],
      rawExcerpt: step.summary,
    },
  };
}

export async function buildRuntimeReviewInput(
  sessionStore: SessionStorePort,
  session: AgentSession,
  runState: RunState,
): Promise<import("@code-mind/verify").ReviewInput> {
  await syncModifiedFilesFromWorkspace(session.workspaceRoot, runState.progress.modifiedFiles);
  const diff =
    (await new DiffManager(session.workspaceRoot, session.id).readLatestDiff()) ?? "";
  const planArtifact = await sessionStore.readPlan(session.id);
  return {
    task: session.task.text,
    ...(planArtifact?.plan === undefined ? {} : { plan: planArtifact.plan }),
    changedFiles: [...runState.progress.modifiedFiles],
    diff,
    testResults:
      runState.verification.lastVerification?.steps.map(verificationStepToTestResult) ?? [],
  };
}

export async function runRuntimeReview(
  sessionStore: SessionStorePort,
  session: AgentSession,
  runState: RunState,
  review: ReviewPort,
): Promise<ReviewResult> {
  const reviewResult = review.review(
    await buildRuntimeReviewInput(sessionStore, session, runState),
  );
  runState.review.lastReview = reviewResult;
  await sessionStore.saveReview(session.id, reviewResult);
  return reviewResult;
}

export type ReviewRecoveryOutcome = "continue" | "retry";

export async function tryReviewRecoveryBeforeCompletion(
  deps: {
    sessionStore: SessionStorePort;
    review: ReviewPort;
    publish: (
      input: RuntimeInput | undefined,
      event: import("@code-mind/shared").AgentEventInput,
    ) => Promise<void>;
  },
  params: {
    session: AgentSession;
    input: RuntimeInput;
    runState: RunState;
    strategy: LoopPolicy;
    stepNumber: number;
  },
): Promise<ReviewRecoveryOutcome> {
  const { sessionStore, publish } = deps;
  const { session, input, runState, strategy, stepNumber } = params;

  if (session.task.mode !== "edit" && session.task.mode !== "agent") {
    return "continue";
  }
  if (runState.progress.modifiedFiles.size === 0) {
    return "continue";
  }

  const lastVerification = runState.verification.lastVerification;
  if (lastVerification !== undefined && !lastVerification.passed) {
    return "continue";
  }

  const review = await runRuntimeReview(sessionStore, session, runState, deps.review);
  if (!review.requiresAnotherIteration) {
    return "continue";
  }
  if (runState.review.recoveryAttempts >= strategy.maxRecoveryAttempts) {
    return "continue";
  }

  runState.review.recoveryAttempts += 1;
  const extraSteps = Math.min(
    3,
    Math.max(2, Math.floor(runState.budget.baseMaxSteps * 0.25)),
  );
  runState.budget.extraStepBudget += extraSteps;
  if (runState.kernel) {
    runState.kernel.maxSteps = getEffectiveMaxSteps(runState);
  }

  await publish(
    input,
    recoveryTriggeredEvent({
      source: "review",
      attempt: runState.review.recoveryAttempts,
      maxAttempts: strategy.maxRecoveryAttempts,
      step: stepNumber,
    }),
  );

  const issueLines = review.issues
    .filter((issue) => issue.severity !== "info")
    .map((issue) => `- [${issue.severity}] ${issue.message}`)
    .join("\n");
  const recoveryHint = `Review found issues (recovery ${runState.review.recoveryAttempts}/${strategy.maxRecoveryAttempts}, step ${stepNumber}/${getEffectiveMaxSteps(runState)}). Address these before finishing:\n${issueLines}${review.suggestions.length > 0 ? `\n\nSuggestions:\n${review.suggestions.map((item) => `- ${item}`).join("\n")}` : ""}`;

  session.messages.push({
    id: createId("msg"),
    role: "user",
    content: recoveryHint,
    createdAt: nowIso(),
  });
  await publish(input, messageUserEvent(recoveryHint));
  return "retry";
}
