import type { AgentResult, UserTask } from "@code-mind/shared";
import { getEffectiveResultStatus } from "@code-mind/core";
import type { DisplayLevel } from "./display-level.js";
import { hr, shortPath, theme } from "./theme.js";
import { formatTokenUsageSummary } from "./format.js";
import type { TokenUsage } from "@code-mind/shared";
import { formatFinalText } from "./final-text.js";
import {
  describeCompletionReason,
  readChangeEntries,
  renderChangedFiles,
  renderNextSection,
  renderResultFooterLines,
} from "./result-summary.js";

export type { ChangeEntry } from "./result-summary.js";
export { describeCompletionReason, readChangeEntries, renderChangedFiles } from "./result-summary.js";

function renderErrorGuidance(result: AgentResult): string[] {
  const status = getEffectiveResultStatus(result);
  if (status === "success") {
    return [];
  }

  const lines = ["Failure", `  Status: ${status}`];
  if (result.status !== status) {
    lines.push(`  Termination: ${result.status}`);
  }
  if (typeof result.metadata?.rejectionSource === "string") {
    lines.push(`  Source: ${result.metadata.rejectionSource}`);
  }
  const verification = result.metadata?.verification as { summary?: unknown } | undefined;
  if (typeof verification?.summary === "string" && verification.summary.length > 0) {
    lines.push(`  Verification: ${verification.summary}`);
  }
  lines.push("  Next: inspect the session summary and rerun with a narrower target if needed.");
  lines.push("");
  return lines;
}

function renderReviewGuidance(result: AgentResult): string[] {
  return [
    "Review",
    `  code-mind sessions show ${result.sessionId}`,
    "  git diff",
    "  git status",
  ];
}

import { renderFormattedPlan } from "./plan-format.js";

export function renderPlanBlock(planText: string): string {
  return renderFormattedPlan(planText);
}

export function renderTaskResult(
  task: UserTask,
  result: AgentResult,
  options: {
    level?: DisplayLevel;
    verbose?: boolean;
    stream?: NodeJS.WriteStream;
    skipBody?: boolean;
  } = {},
): string {
  const level: DisplayLevel =
    options.level ??
    (options.verbose ? 2 : 0);

  const body = options.skipBody
    ? ""
    : formatFinalText(result.summary ?? result.finalText, {
        level,
        ...(options.stream === undefined ? {} : { stream: options.stream }),
      });

  if (level === 0) {
    return options.skipBody ? "\n" : `${body}\n`;
  }

  const lines = [
    ...(body.length > 0 ? [body] : []),
    ...renderResultFooterLines(task, result, level, options.stream),
  ];
  const changedFiles = renderChangedFiles(result);
  if (changedFiles.length > 0) {
    lines.push(...changedFiles);
  }
  const errorGuidance = renderErrorGuidance(result);
  if (errorGuidance.length > 0) {
    lines.push(...errorGuidance);
  }
  lines.push(...renderNextSection(result, task));
  lines.push(...renderReviewGuidance(result), "");

  if (level >= 2) {
    lines.splice(lines.length - 1, 0, hr(), theme.dim(result.sessionId), theme.dim(shortPath(task.cwd)));
    const tokenUsage = result.metadata?.tokenUsage as TokenUsage | undefined;
    if (tokenUsage) {
      lines.splice(lines.length - 1, 0, theme.dim(formatTokenUsageSummary(tokenUsage)));
    }
    lines.splice(
      lines.length - 1,
      0,
      theme.dim(
        `activity: ${String(result.metadata?.activitySummary?.last ?? "unknown")}`,
      ),
    );
  }

  return `${lines.join("\n")}\n`;
}

export function renderVerification(summary: string): string {
  return summary;
}
