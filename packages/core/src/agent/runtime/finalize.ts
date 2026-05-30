import type { AgentResult, CompletionKind } from "@code-mind/shared";
import type { RunState } from "./run-state.js";
import { getEffectiveMaxSteps } from "./run-state.js";
import { hasExplorationProgress, isReadOnlyRun } from "./run-state.js";

export function classifyCompletion(
  result: AgentResult,
  runState: RunState,
): CompletionKind {
  if (result.status === "incomplete") {
    return "incomplete_summary";
  }
  if (
    runState.progress.modifiedFiles.size > 0 &&
    runState.verification.lastVerification?.passed
  ) {
    if (runState.review?.lastReview?.requiresAnotherIteration) {
      return "review_failed";
    }
    return "modified_verified";
  }
  if (
    runState.progress.modifiedFiles.size > 0 &&
    runState.verification.lastVerification &&
    !runState.verification.lastVerification.passed
  ) {
    return "verification_failed";
  }
  if (runState.progress.modifiedFiles.size > 0) {
    return "modified_unverified";
  }
  if (runState.verification.lastVerification?.passed) {
    return "verified_only";
  }
  if (
    runState.progress.mode === "plan" &&
    isReadOnlyRun(runState) &&
    (runState.progress.closingTurn || hasExplorationProgress(runState))
  ) {
    return "plan_delivered";
  }
  if (
    runState.progress.mode === "ask" &&
    isReadOnlyRun(runState) &&
    hasExplorationProgress(runState)
  ) {
    return "diagnosed_only";
  }
  if (isReadOnlyRun(runState) && hasExplorationProgress(runState)) {
    return result.status === "stopped_by_limit"
      ? "interrupted_with_findings"
      : "diagnosed_only";
  }
  if (result.status === "stopped_by_limit") {
    return "interrupted_with_findings";
  }
  return "no_progress";
}

function resolveEffectiveStatus(
  status: AgentResult["status"],
  completion: CompletionKind,
): AgentResult["status"] {
  if (completion === "review_failed" && status === "success") {
    return "stopped_by_limit";
  }
  if (
    (status === "stopped_by_limit" ||
      status === "permission_denied" ||
      status === "user_rejected") &&
    (completion === "modified_verified" || completion === "verified_only")
  ) {
    return "success";
  }
  return status;
}

export function finalizeResult(result: AgentResult, runState: RunState): AgentResult {
  const completion = classifyCompletion(result, runState);
  let summary = result.summary ?? result.finalText;

  if (completion === "modified_verified" || completion === "verified_only") {
    summary = `${summary}\nVerification: passed.`;
  } else if (completion === "verification_failed") {
    summary = `${summary}\nVerification: failed.\n${runState.verification.lastVerification?.summary ?? ""}`;
  } else if (completion === "review_failed") {
    const reviewIssues =
      runState.review?.lastReview?.issues
        .filter((issue) => issue.severity !== "info")
        .map((issue) => issue.message)
        .join("\n") ?? "";
    summary = `${summary}\nReview: failed.\n${reviewIssues}`;
  } else if (completion === "modified_unverified") {
    summary = `${summary}\nVerification: not run.`;
  }

  const effectiveStatus = resolveEffectiveStatus(result.status, completion);
  if (effectiveStatus === "success" && result.status !== "success") {
    summary = `${summary}\nThe main work had already been completed and verified before the run ended.`;
  }

  return {
    ...result,
    effectiveStatus,
    summary,
    metadata: {
      ...result.metadata,
      completion,
      modifiedFiles: [...runState.progress.modifiedFiles],
      requestedMaxSteps: runState.budget.requestedMaxSteps,
      baseMaxSteps: runState.budget.baseMaxSteps,
      effectiveMaxSteps: getEffectiveMaxSteps(runState),
      ...(runState.progress.lastActivity
        ? {
            activitySummary: {
              last: runState.progress.lastActivity,
              counts: { ...runState.progress.toolCounts },
            },
          }
        : {}),
      ...(runState.verification.lastVerification === undefined
        ? {}
        : { verification: runState.verification.lastVerification }),
      ...(runState.review?.lastReview === undefined
        ? {}
        : { review: runState.review.lastReview }),
      ...(runState.usage && runState.usage.totalTokens > 0
        ? { tokenUsage: { ...runState.usage } }
        : {}),
    },
  };
}
