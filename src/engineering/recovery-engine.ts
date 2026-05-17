import type { TestResult } from "../shared/types.js";

export interface RecoveryDecision {
  shouldRetry: boolean;
  reason: string;
  nextTaskHint?: string;
}

export class RecoveryEngine {
  decideFromVerification(
    failedResults: TestResult[],
    attempt: number,
    maxAttempts: number,
  ): RecoveryDecision {
    if (failedResults.length === 0) {
      return {
        shouldRetry: false,
        reason: "Verification succeeded.",
      };
    }

    if (attempt >= maxAttempts) {
      return {
        shouldRetry: false,
        reason: "Reached max verification recovery attempts.",
      };
    }

    const summary = failedResults
      .map((result) => result.summary.errorMessages[0] ?? result.summary.rawExcerpt)
      .filter(Boolean)
      .join("\n");

    return {
      shouldRetry: true,
      reason: "Verification failed and one more repair iteration is allowed.",
      nextTaskHint: `Verification failed. Read the relevant files and fix these issues before finishing:\n${summary}`,
    };
  }
}
