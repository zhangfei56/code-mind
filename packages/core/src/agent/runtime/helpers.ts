import type { AgentSession, VerificationResult } from "@code-mind/shared";
import type { RunState } from "./run-state.js";

export { getEffectiveMaxSteps } from "./run-state.js";

export function summarizeVerification(result: VerificationResult): string {
  return [
    result.passed ? "Automatic verification passed." : "Automatic verification failed.",
    result.summary,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildFallbackFinalText(
  session: import("@code-mind/shared").AgentSession,
  runState: RunState,
): string {
  const recentPaths = session.observations
    .map((item) => item.toolCall.arguments.path)
    .filter((value): value is string => typeof value === "string")
    .slice(-3);
  const recentListDirEntries = session.observations
    .flatMap((item) => {
      if (item.toolCall.name !== "list_dir") {
        return [];
      }
      const entries = item.toolResult.data as { entries?: unknown } | undefined;
      return Array.isArray(entries?.entries)
        ? entries.entries.filter((entry): entry is string => typeof entry === "string")
        : [];
    })
    .slice(0, 8);

  const lines = ["The model did not produce a plain-text final summary."];
  if (runState.progress.lastActivity) {
    lines.push(`Last activity: ${runState.progress.lastActivity}.`);
  }

  if (recentPaths.length > 0) {
    lines.push(`Most recent files or paths inspected: ${recentPaths.join(", ")}.`);
  }

  if (recentListDirEntries.length > 0) {
    lines.push(`Recent directory evidence: ${recentListDirEntries.join(", ")}.`);
  }

  if (runState.progress.modifiedFiles.size > 0) {
    lines.push(`Modified files: ${[...runState.progress.modifiedFiles].join(", ")}.`);
  }

  if (runState.verification.lastVerification) {
    lines.push(
      runState.verification.lastVerification.passed
        ? `Verification passed: ${runState.verification.lastVerification.summary}`
        : `Verification failed: ${runState.verification.lastVerification.summary}`,
    );
  }

  if (runState.progress.mode === "ask" || runState.progress.mode === "plan") {
    lines.push("Next action: summarize the most likely failure points based on the inspected files.");
  } else {
    lines.push("Next action: continue from the most recently inspected file and verify the narrowest concrete change.");
  }

  return lines.join("\n");
}
