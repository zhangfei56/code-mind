import type { AgentEvent, TokenUsage, ToolCall } from "@code-mind/shared";
import type { DisplayLevel } from "../display-level.js";
import { formatContextUsage, formatDuration, formatTokenUsageSummary } from "../format.js";
import { formatApprovalAction, isHighRiskTool, riskHintForTool } from "./tool-blocks.js";
import { describeToolIntent } from "./tool-intent.js";
import { resolveTerminalWidth, wrapPrefixedBlock } from "../text-wrap.js";
import {
  colorApprovalBodyLine,
  colorApprovalLabel,
  colorFoldLine,
  colorHeaderValue,
  colorSectionLabel,
} from "../journal-theme.js";
import { shortPath, theme } from "../theme.js";

export interface RunHeaderOptions {
  cliVersion?: string;
  task: string;
  mode: string;
  cwd: string;
  level: DisplayLevel;
  stream?: NodeJS.WriteStream;
  modelName?: string;
  workspaceRoot?: string;
  gitSummary?: string;
  modelProvider?: string;
  configuredModelName?: string;
  toolCount?: number;
  mcpServerCount?: number;
  configLines?: string[];
  detectedLines?: string[];
  rootHint?: string;
  sandboxMode?: string;
  approvalMode?: string;
  networkMode?: string;
}

function renderUnderstanding(task: string, mode: string): string {
  if (mode === "ask") {
    return "Inspect the codebase, gather evidence, and answer without changing files.";
  }
  if (mode === "plan") {
    return "Inspect the relevant code paths and produce an executable implementation plan.";
  }
  if (/\b(test|fix|bug|error|fail|failure)\b/i.test(task)) {
    return "Inspect the failing path, narrow the cause, apply the smallest coherent change, and verify it.";
  }
  if (/\b(add|create|implement|build)\b/i.test(task)) {
    return "Inspect the existing structure, extend current conventions, and verify the new behavior.";
  }
  return "Inspect the relevant project context, make the smallest coherent change, and verify the result.";
}

function renderAssumptions(mode: string): string[] {
  const lines = [
    "  - Reuse existing project conventions and nearby patterns",
    "  - Keep scope limited to the requested task unless evidence requires more",
  ];
  if (mode === "edit" || mode === "agent") {
    lines.push("  - Run a relevant verification step before finishing when available");
  }
  return lines;
}

function renderRisk(mode: string): string | undefined {
  if (mode === "edit" || mode === "agent") {
    return "May modify workspace files or run verification commands depending on the task.";
  }
  if (mode === "plan") {
    return "Plan quality depends on locating the correct entry points and surrounding conventions.";
  }
  return undefined;
}

export function renderRunHeader(options: RunHeaderOptions): string[] {
  const {
    task,
    cliVersion,
    mode,
    cwd,
    level,
    stream,
    modelName,
    workspaceRoot,
    gitSummary,
    modelProvider,
    configuredModelName,
    toolCount,
    mcpServerCount,
    configLines,
    detectedLines,
    rootHint,
    sandboxMode,
    approvalMode,
    networkMode,
  } = options;
  const lines: string[] = [
    theme.bold(cliVersion ? `code-mind v${cliVersion}` : "code-mind", stream),
    "",
  ];

  lines.push(colorSectionLabel("Task", stream));
  lines.push(`  ${task}`);
  if (level >= 1) {
    lines.push("");
    lines.push(colorSectionLabel("Understanding", stream));
    lines.push(theme.dim(`  ${renderUnderstanding(task, mode)}`, stream));
    if (level >= 2) {
      lines.push("");
      lines.push(colorSectionLabel("Assumptions", stream));
      lines.push(...renderAssumptions(mode));
      const risk = renderRisk(mode);
      if (risk) {
        lines.push("");
        lines.push(colorSectionLabel("Risk", stream));
        lines.push(`  ${risk}`);
      }
    }
  }
  lines.push("");
  lines.push(colorSectionLabel("Workspace", stream));
  lines.push(colorHeaderValue("Path", shortPath(cwd), stream));
  lines.push(colorHeaderValue("Root", shortPath(workspaceRoot ?? cwd), stream));
  if (rootHint) {
    lines.push(colorHeaderValue("Root basis", rootHint, stream));
  }
  if (gitSummary) {
    lines.push(colorHeaderValue("Git", gitSummary, stream));
  }

  if (level >= 1 && detectedLines && detectedLines.length > 0) {
    lines.push("");
    lines.push(colorSectionLabel("Detected", stream));
    for (const line of (level >= 2 ? detectedLines : detectedLines.slice(0, 3))) {
      lines.push(`  ${line}`);
    }
  }

  if (level >= 1) {
    lines.push("");
    lines.push(colorSectionLabel("Model", stream));
    if (level === 1) {
      lines.push(`  ${configuredModelName ?? modelName ?? "unknown"} · ${mode}`);
    } else {
      if (modelProvider) {
        lines.push(colorHeaderValue("Provider", modelProvider, stream));
      }
      lines.push(colorHeaderValue("Model", configuredModelName ?? modelName ?? "unknown", stream));
      lines.push(colorHeaderValue("Mode", mode, stream));
    }
  }

  if (level >= 1 && (sandboxMode || approvalMode || networkMode)) {
    lines.push("");
    lines.push(colorSectionLabel("Security", stream));
    if (sandboxMode) {
      lines.push(colorHeaderValue("Sandbox", sandboxMode, stream));
    }
    if (approvalMode) {
      lines.push(colorHeaderValue("Approval", approvalMode, stream));
    }
    if (networkMode) {
      lines.push(colorHeaderValue("Network", networkMode, stream));
    }
  }

  if (level >= 2 && (toolCount !== undefined || mcpServerCount !== undefined)) {
    lines.push("");
    lines.push(colorSectionLabel("Tools", stream));
    if (toolCount !== undefined) {
      lines.push(`  Available: ${toolCount}`);
    }
    if (mcpServerCount !== undefined) {
      lines.push(`  MCP: ${mcpServerCount} configured`);
    }
  }

  if (level >= 2 && configLines && configLines.length > 0) {
    lines.push("");
    lines.push(colorSectionLabel("Config", stream));
    for (const line of configLines) {
      lines.push(`  ${line}`);
    }
  }

  lines.push("");
  return lines;
}

function wrapIntentText(text: string, stream?: NodeJS.WriteStream): string[] {
  const width = resolveTerminalWidth(stream);
  return wrapPrefixedBlock(text, width, "  ");
}

function payloadToolCalls(payload: Record<string, unknown>, key: string): ToolCall[] {
  const value = payload[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is ToolCall => {
    return (
      typeof item === "object" &&
      item !== null &&
      typeof (item as ToolCall).id === "string" &&
      typeof (item as ToolCall).name === "string"
    );
  });
}

/** Model rationale + planned tool intents before tools run (L1+). */
export function renderModelIntentLines(event: AgentEvent, level: DisplayLevel): string[] {
  if (event.kind !== "model.response") {
    return [];
  }
  const p = event.payload;
  const toolCallCount = typeof p.toolCallCount === "number" ? p.toolCallCount : 0;
  if (level < 1 || toolCallCount === 0) {
    return [];
  }

  const lines: string[] = [];
  const preview = typeof p.textPreview === "string" ? p.textPreview.trim() : "";
  if (preview) {
    lines.push("Why");
    lines.push(...wrapIntentText(preview));
  }

  const planned = payloadToolCalls(p, "plannedToolCalls");
  if (planned.length > 0) {
    lines.push("Plan");
    for (const toolCall of planned.slice(0, 4)) {
      lines.push(`  · ${describeToolIntent(toolCall)}`);
    }
    if (planned.length > 4) {
      lines.push(`  · … ${planned.length - 4} more tool${planned.length - 4 === 1 ? "" : "s"}`);
    }
  }

  if (lines.length === 0) {
    return [];
  }
  lines.push("");
  return lines;
}

export type ApprovalPromptStyle = "display" | "repl" | "inline";

export interface ApprovalBlockOptions {
  stepIntent?: string;
  toolIntent?: string;
}

function payloadToolCall(payload: Record<string, unknown>): ToolCall | undefined {
  const raw = payload.toolCall;
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? "unknown"),
    arguments:
      typeof record.arguments === "object" && record.arguments !== null
        ? (record.arguments as Record<string, unknown>)
        : {},
  };
}

export function renderApprovalBlock(
  event: AgentEvent,
  stream?: NodeJS.WriteStream,
  promptStyle: ApprovalPromptStyle = "display",
  extras: ApprovalBlockOptions = {},
): string[] {
  if (event.kind !== "approval.requested") {
    return [];
  }
  const p = event.payload;
  const toolCall = payloadToolCall(p);
  if (toolCall === undefined) {
    return [];
  }
  const reason = typeof p.reason === "string" ? p.reason : "";
  const highRisk = isHighRiskTool(toolCall);
  const width = resolveTerminalWidth(stream);
  const lines = [
    "",
    theme.yellow(highRisk ? "High-risk approval required" : "Approval required", stream),
    "",
  ];

  if (extras.stepIntent?.trim()) {
    lines.push(colorApprovalLabel("Context", stream), ...wrapPrefixedBlock(extras.stepIntent.trim(), width), "");
  }

  lines.push(colorApprovalLabel("Action", stream));
  for (const actionLine of formatApprovalAction(toolCall)) {
    const indentMatch = actionLine.match(/^(\s*)/);
    const indent = indentMatch?.[1] ?? "  ";
    const content = actionLine.slice(indent.length);
    const wrapped = wrapPrefixedBlock(content, width, indent);
    if (content === "Run command:" || content === "Apply patch:" || content.startsWith("Sub-agent")) {
      lines.push(...wrapped.map((line) => (stream ? theme.dim(line, stream) : line)));
    } else {
      lines.push(...wrapped.map((line) => colorApprovalBodyLine(line, stream, { command: true })));
    }
  }
  lines.push("");

  if (extras.toolIntent?.trim()) {
    lines.push(
      colorApprovalLabel("Why this action", stream),
      ...wrapPrefixedBlock(extras.toolIntent.trim(), width),
      "",
    );
  }

  lines.push(
    colorApprovalLabel("Reason", stream),
    ...wrapPrefixedBlock(reason, width),
    "",
    colorApprovalLabel("Risk", stream),
    ...wrapPrefixedBlock(riskHintForTool(toolCall), width),
    "",
  );

  if (promptStyle === "display") {
    lines.push(
      colorApprovalLabel("Reply", stream),
      ...wrapPrefixedBlock("Type y/a/n/e at the approval › prompt below.", width),
      "",
    );
  } else if (promptStyle === "repl") {
    lines.push(
      "Reply at approval ›",
      "  [y] once  [a] always  [n] no  [e] explain  ·  /approve  /deny",
      "",
    );
  }

  return lines;
}

export function renderModelTraceLine(event: AgentEvent): string | null {
  if (event.kind !== "model.response") {
    return null;
  }
  const p = event.payload;
  const parts: string[] = [];
  const ctx = typeof p.contextTokens === "number" ? p.contextTokens : undefined;
  const maxCtx = typeof p.maxContextTokens === "number" ? p.maxContextTokens : undefined;
  if (ctx !== undefined) {
    parts.push(`ctx ${formatContextUsage(ctx, maxCtx)}`);
  }
  const usage = p.usage as TokenUsage | undefined;
  if (usage) {
    parts.push(formatTokenUsageSummary(usage));
  }
  const durationMs = typeof p.durationMs === "number" ? p.durationMs : undefined;
  if (durationMs !== undefined) {
    parts.push(formatDuration(durationMs));
  }
  if (parts.length === 0) {
    return null;
  }
  return `  ~ ${parts.join(" · ")}`;
}
