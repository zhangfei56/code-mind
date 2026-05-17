import type { AgentPlan, ReviewIssue, ReviewResult, TestResult } from "../shared/types.js";

export interface ReviewInput {
  task: string;
  plan?: AgentPlan;
  changedFiles: string[];
  diff: string;
  testResults: TestResult[];
  projectRules?: string;
}

export class ReviewEngine {
  review(input: ReviewInput): ReviewResult {
    const issues: ReviewIssue[] = [];
    const changedTests = input.changedFiles.some((file) => /test|spec/i.test(file));
    const changedSource = input.changedFiles.some((file) => file.startsWith("src/"));

    if (changedSource && !changedTests) {
      issues.push({
        severity: "warning",
        message: "Source files changed without matching test updates.",
      });
    }

    if (input.testResults.some((result) => !result.success)) {
      issues.push({
        severity: "error",
        message: "Verification still contains failing commands.",
      });
    }

    if (input.diff.trim().length === 0) {
      issues.push({
        severity: "warning",
        message: "No diff detected; task may not be completed.",
      });
    }

    return {
      passed: !issues.some((issue) => issue.severity === "error"),
      issues,
      suggestions: issues.some((issue) => issue.severity === "warning")
        ? ["Review whether test coverage should be expanded."]
        : [],
      requiresAnotherIteration: issues.some((issue) => issue.severity !== "info"),
    };
  }
}
