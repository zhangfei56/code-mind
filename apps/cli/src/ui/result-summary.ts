import type { AgentResult, AgentEvent, UserTask, TokenUsage } from "@code-mind/shared";
import { getEffectiveResultStatus } from "@code-mind/core";
import type { DisplayLevel } from "./display-level.js";
import { formatContextUsage, formatTokenUsageSummary, outcomeGlyph } from "./format.js";
import { shortPath, statusColor, theme } from "./theme.js";

export interface ChangeEntry {
  path: string;
  status: "A" | "M" | "D";
  summary?: string;
}

function inferChangeCategory(path: string): string {
  if (/(^|\/)(tests?|__tests__|spec)(\/|$)/i.test(path) || /\.(test|spec)\./i.test(path)) {
    return "test coverage";
  }
  if (/(^|\/)docs(\/|$)/i.test(path) || /(^|\/)README\.md$/i.test(path) || /\.md$/i.test(path)) {
    return "documentation";
  }
  if (/(^|\/)(config|configs)(\/|$)/i.test(path) || /\.(json|ya?ml|toml|ini|lock)$/i.test(path)) {
    return "configuration";
  }
  if (/(^|\/)src(\/|$)/i.test(path) || /\.(ts|tsx|js|jsx|py|go|rs|java|rb)$/i.test(path)) {
    return "source behavior";
  }
  return "project files";
}

function inferChangeSummary(path: string, status: ChangeEntry["status"]): string {
  const category = inferChangeCategory(path);
  switch (status) {
    case "A":
      return `Added ${category}.`;
    case "D":
      return `Removed ${category}.`;
    case "M":
    default:
      return `Updated ${category}.`;
  }
}

export function readChangeEntries(result: AgentResult): ChangeEntry[] {
  const changedFiles = result.metadata?.changedFiles;
  if (Array.isArray(changedFiles)) {
    return changedFiles.flatMap((value) => {
      if (
        typeof value !== "object" ||
        value === null ||
        typeof (value as { path?: unknown }).path !== "string" ||
        typeof (value as { status?: unknown }).status !== "string"
      ) {
        return [];
      }
      const entry = value as ChangeEntry;
      return [{
        ...entry,
        summary: entry.summary ?? inferChangeSummary(entry.path, entry.status),
      }];
    });
  }

  const modifiedFiles = Array.isArray(result.metadata?.modifiedFiles)
    ? result.metadata.modifiedFiles.filter((value): value is string => typeof value === "string")
    : [];
  return modifiedFiles.map((path) => ({
    path,
    status: "M",
    summary: inferChangeSummary(path, "M"),
  }));
}

export function describeCompletionReason(result: AgentResult): string | undefined {
  const completion = result.metadata?.completion;
  switch (completion) {
    case "modified_verified":
      return "Completed after applying changes and passing verification.";
    case "modified_unverified":
      return "Completed after applying changes without running verification.";
    case "verification_failed":
      return "Stopped after changes failed verification.";
    case "verified_only":
      return "Completed after verification passed without changing files.";
    case "diagnosed_only":
      return "Completed after gathering enough evidence to answer.";
    case "plan_delivered":
      return "Completed after producing an executable plan.";
    case "interrupted_with_findings":
      return "Stopped at the step limit after collecting partial findings.";
    case "no_progress":
      return "Stopped before producing meaningful findings or changes.";
    default:
      return undefined;
  }
}

export interface StructuredRunResult {
  sessionId: string;
  status: string;
  termination: string;
  task: string;
  mode: string;
  cwd: string;
  model: string;
  steps: number;
  summary: string;
  files_changed: Array<{
    path: string;
    status: string;
    summary?: string;
  }>;
  commands: Array<{
    cmd: string;
    exit_code: number | null;
    duration_ms?: number;
  }>;
  validation: {
    tests?: string;
    lint?: string;
    build?: string;
    summary?: string;
  };
  metadata: Record<string, unknown>;
}

function readCommandRuns(result: AgentResult): StructuredRunResult["commands"] {
  const raw = result.metadata?.commandRuns;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }
    const cmd = (entry as { cmd?: unknown }).cmd;
    if (typeof cmd !== "string") {
      return [];
    }
    const exitCode = (entry as { exitCode?: unknown; exit_code?: unknown }).exitCode ??
      (entry as { exit_code?: unknown }).exit_code;
    return [{
      cmd,
      exit_code: typeof exitCode === "number" ? exitCode : null,
      ...((entry as { durationMs?: unknown }).durationMs !== undefined &&
      typeof (entry as { durationMs?: unknown }).durationMs === "number"
        ? { duration_ms: (entry as { durationMs: number }).durationMs }
        : {}),
    }];
  });
}

function readValidation(result: AgentResult): StructuredRunResult["validation"] {
  const verification = result.metadata?.verification;
  if (typeof verification !== "object" || verification === null) {
    return {};
  }
  const record = verification as unknown as Record<string, unknown>;
  const validation: StructuredRunResult["validation"] = {};
  for (const key of ["tests", "lint", "build", "summary"] as const) {
    if (typeof record[key] === "string") {
      validation[key] = record[key];
    }
  }
  if (typeof record.passed === "boolean" && validation.summary === undefined) {
    validation.summary = record.passed ? "passed" : "failed";
  }
  return validation;
}

export function renderChangedFiles(result: AgentResult): string[] {
  const entries = readChangeEntries(result);
  if (entries.length === 0) {
    return [];
  }
  const lines = ["Files changed"];
  for (const entry of entries) {
    lines.push(`  ${entry.status} ${shortPath(entry.path)}`);
    lines.push(`    ${entry.summary ?? inferChangeSummary(entry.path, entry.status)}`);
  }
  lines.push("");
  return lines;
}

export function buildStructuredRunResult(
  task: UserTask,
  result: AgentResult,
): StructuredRunResult {
  return {
    sessionId: result.sessionId,
    status: getEffectiveResultStatus(result),
    termination: result.status,
    task: task.text,
    mode: task.mode,
    cwd: task.cwd,
    model: result.modelName,
    steps: result.steps,
    summary: result.summary ?? result.finalText,
    files_changed: readChangeEntries(result).map((entry) => ({
      path: entry.path,
      status: entry.status === "A" ? "added" : entry.status === "D" ? "deleted" : "modified",
      ...(entry.summary === undefined ? {} : { summary: entry.summary }),
    })),
    commands: readCommandRuns(result),
    validation: readValidation(result),
    metadata: result.metadata ?? {},
  };
}

export function renderTurnFinishedLine(event: AgentEvent): string {
  if (event.kind !== "turn.finished") {
    return "";
  }
  const p = event.payload;
  const status = typeof p.status === "string" ? p.status : "unknown";
  const steps = typeof p.steps === "number" ? p.steps : 0;
  const modifiedFilesCount = typeof p.modifiedFilesCount === "number" ? p.modifiedFilesCount : undefined;
  const tokenUsage = p.tokenUsage as TokenUsage | undefined;
  const contextTokens = typeof p.contextTokens === "number" ? p.contextTokens : undefined;
  const maxContextTokens = typeof p.maxContextTokens === "number" ? p.maxContextTokens : undefined;

  const glyph = outcomeGlyph(status);
  const parts = [`${glyph} ${steps} step${steps === 1 ? "" : "s"} · ${status}`];
  if (modifiedFilesCount !== undefined && modifiedFilesCount > 0) {
    parts.push(
      `${modifiedFilesCount} file${modifiedFilesCount === 1 ? "" : "s"} changed`,
    );
  }
  if (tokenUsage && tokenUsage.totalTokens > 0) {
    parts.push(formatTokenUsageSummary(tokenUsage));
  } else if (contextTokens !== undefined) {
    parts.push(formatContextUsage(contextTokens, maxContextTokens));
  }
  return parts.join(" · ");
}

export function renderImplementedSection(result: AgentResult): string[] {
  const entries = readChangeEntries(result);
  if (entries.length === 0) {
    return [];
  }
  return [
    "Implemented",
    ...entries.map((entry) => `  - ${entry.summary ?? inferChangeSummary(entry.path, entry.status)}`),
    "",
  ];
}

export function renderValidationSection(result: AgentResult): string[] {
  const validation = readValidation(result);
  const lines: string[] = [];
  if (validation.tests) {
    lines.push(`  ${validation.tests === "passed" ? "✓" : "×"} tests ${validation.tests}`);
  }
  if (validation.lint) {
    lines.push(`  ${validation.lint === "passed" ? "✓" : "×"} lint ${validation.lint}`);
  }
  if (validation.build) {
    lines.push(`  ${validation.build === "passed" ? "✓" : "×"} build ${validation.build}`);
  }
  if (lines.length === 0 && validation.summary) {
    lines.push(`  ${validation.summary.includes("fail") ? "×" : "✓"} ${validation.summary}`);
  }
  if (lines.length === 0) {
    return [];
  }
  return ["Validation", ...lines, ""];
}

export function renderNextSection(result: AgentResult, task: UserTask): string[] {
  const status = getEffectiveResultStatus(result);
  const entries = readChangeEntries(result);
  const validation = readValidation(result);

  if (status === "success") {
    if (entries.length > 0) {
      return ["Next", "  Review changes with git diff and git status before committing.", ""];
    }
    if (task.mode === "plan") {
      return ["Next", "  Run code-mind sessions execute <session-id> to apply this plan.", ""];
    }
    return [];
  }

  if (status === "stopped_by_limit") {
    return [
      "Next",
      "  Rerun with a narrower scope or increase --max-steps.",
      "",
    ];
  }

  if (validation.summary?.includes("fail")) {
    return [
      "Next",
      "  Inspect the failing command output and rerun with a focused fix target.",
      "",
    ];
  }

  return [
    "Next",
    "  Inspect the session summary and rerun with a narrower target if needed.",
    "",
  ];
}

export function renderFollowUpCommands(result: AgentResult): string[] {
  const changed = readChangeEntries(result).length > 0;
  const lines = [
    changed ? "Review changes" : "Inspect",
    `  code-mind sessions show ${result.sessionId}`,
  ];

  if (result.runId) {
    lines.push(`  code-mind runs show ${result.runId}`);
  }

  if (changed) {
    lines.push("  git diff", "  git status");
  }

  return lines;
}

export function renderPartialSection(result: AgentResult): string[] {
  const status = getEffectiveResultStatus(result);
  if (status === "success" || status === "failed") {
    return [];
  }
  const completion = describeCompletionReason(result);
  if (!completion) {
    return [];
  }
  return ["Partially done", `  ${completion}`, ""];
}

export function renderResultFooterLines(
  task: UserTask,
  result: AgentResult,
  level: DisplayLevel,
  stream?: NodeJS.WriteStream,
): string[] {
  if (level === 0) {
    return [];
  }

  const status = getEffectiveResultStatus(result);
  const lines: string[] = ["", "Done", ""];

  if (level === 1) {
    lines.push("Status");
    lines.push(
      `  ${status} · ${result.steps} step${result.steps === 1 ? "" : "s"} · ${result.modelName}`,
    );
    lines.push("");
    const completionReason = describeCompletionReason(result);
    if (completionReason) {
      lines.push("Completion");
      lines.push(`  ${completionReason}`);
      lines.push("");
    }
    lines.push(...renderPartialSection(result));
    lines.push(...renderImplementedSection(result));
    lines.push(...renderValidationSection(result));
    return lines;
  }

  lines.push("Status");
  const meta = [
    statusColor(status)(status),
    theme.dim(`${result.steps} step${result.steps === 1 ? "" : "s"}`),
    theme.dim(result.modelName),
    theme.dim(task.mode),
  ].join(theme.dim(" · "));
  lines.push(`  ${meta}`);
  lines.push("");
  const completionReason = describeCompletionReason(result);
  if (completionReason) {
    lines.push(theme.dim(`completion: ${completionReason}`, stream));
    lines.push("");
  }
  lines.push(...renderPartialSection(result));
  lines.push(...renderImplementedSection(result));
  lines.push(...renderValidationSection(result));
  return lines;
}
