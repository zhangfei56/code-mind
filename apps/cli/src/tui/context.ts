import type { AgentMode, AgentPlan, TokenUsage } from "@code-mind/shared";
import { formatContextUsage, formatTokenUsageSummary } from "../ui/format.js";
import { securityInfoForMode } from "../ui/header-details.js";
import { shortPath } from "../ui/theme.js";
import { truncate } from "./state.js";

export interface TuiContextSnapshot {
  filesRead: string[];
  filesChanged: string[];
  commandsRun: number;
  compactionCount: number;
  promptMessageCount: number;
  contextTokens?: number;
  maxContextTokens?: number;
  tokenUsage?: TokenUsage;
  activityDetail: string;
  step: number;
  maxSteps: number;
  sessionId?: string;
  agentPlan?: AgentPlan;
}

export function renderTuiContextPanel(input: TuiContextSnapshot): string {
  const lines = [
    "{cyan-fg}{bold}Context{/bold}{/cyan-fg}",
    "",
    "Session",
    `  ID       ${input.sessionId ?? "none"}`,
    `  Step     ${input.step}/${input.maxSteps || "?"}`,
    ...(input.activityDetail ? [`  Detail   ${truncate(input.activityDetail, 72)}`] : []),
    "",
    "Activity",
    `  Files read     ${input.filesRead.length}`,
    `  Files changed  ${input.filesChanged.length}`,
    `  Commands run   ${input.commandsRun}`,
    `  Messages       ${input.promptMessageCount || "n/a"}`,
    `  Context        ${
      input.contextTokens === undefined
        ? "n/a"
        : formatContextUsage(input.contextTokens, input.maxContextTokens)
    }`,
    `  Compactions    ${input.compactionCount}`,
  ];

  if (input.filesRead.length > 0) {
    lines.push("", "Included files");
    for (const file of input.filesRead.slice(-8)) {
      lines.push(`  ${shortPath(file)}`);
    }
    if (input.filesRead.length > 8) {
      lines.push(`  … ${input.filesRead.length - 8} more`);
    }
  }

  if (input.agentPlan?.affectedFiles.length) {
    lines.push("", "Planned files");
    for (const file of input.agentPlan.affectedFiles.slice(0, 8)) {
      lines.push(`  ${file.action.padEnd(6)} ${shortPath(file.path)}`);
    }
  }

  if (input.tokenUsage) {
    lines.push("", "Tokens", `  ${formatTokenUsageSummary(input.tokenUsage)}`);
  }

  lines.push("", "{gray-fg}q close{/gray-fg}");
  return lines.join("\n");
}

export function renderTuiStatusDetails(input: {
  cwd: string;
  mode: AgentMode;
  model: string;
  gitSummary?: string;
  step: number;
  maxSteps: number;
  sessionId?: string;
  status: string;
  taskText?: string;
  filesRead: number;
  filesChanged: number;
  commandsRun: number;
}): string {
  const security = securityInfoForMode(input.mode);
  return [
    "{green-fg}{bold}Status{/bold}{/green-fg}",
    "",
    `Task           ${truncate(input.taskText ?? "—", 64)}`,
    `Mode           ${input.mode}`,
    `Model          ${input.model}`,
    `Workspace      ${shortPath(input.cwd)}`,
    `Git            ${input.gitSummary ?? "n/a"}`,
    `Step           ${input.step} / ${input.maxSteps || "?"}`,
    `Session        ${input.sessionId ?? "none"}`,
    `Run status     ${input.status}`,
    `Files read     ${input.filesRead}`,
    `Files changed  ${input.filesChanged}`,
    `Commands run   ${input.commandsRun}`,
    `Permissions    files rw · commands ${security.approval} · network ${security.network}`,
    "",
    "{gray-fg}q close{/gray-fg}",
  ].join("\n");
}

export function renderTuiDiffPanel(diffSummary: string, evidenceText: string): string {
  const body = diffSummary.trim() || evidenceText.trim() || "No diff or evidence yet.";
  return [
    "{blue-fg}{bold}Diff{/bold}{/blue-fg}",
    "",
    body,
    "",
    "{gray-fg}q close   /reason summary{/gray-fg}",
  ].join("\n");
}
