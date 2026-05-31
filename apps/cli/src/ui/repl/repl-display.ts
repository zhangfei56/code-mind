import type { AgentEvent, ToolCall, TokenUsage } from "@code-mind/shared";
import { activityLabel } from "@code-mind/shared";
import type { ActivityKind } from "@code-mind/shared";
import { formatContextUsage, formatDuration, formatTokenUsageSummary } from "../format.js";
import { formatToolCallLineFromResult } from "../agent-output/tool-call-line.js";
import { describeToolIntent } from "../agent-output/tool-intent.js";
import { shortPath, theme } from "../theme.js";

const MAX_VISIBLE_ACTIVITY = 3;

export interface ReplDisplayState {
  mode: string;
  model: string;
  cwd: string;
  gitSummary?: string;
  step: number;
  maxSteps: number;
  sessionStatus: string;
  assistantBrief?: string;
  thinkingFocus?: string;
  nextAction?: string;
  reasoningPreview?: string;
  plannedToolCalls: ToolCall[];
  activityRows: ReplActivityRow[];
  hiddenActivityCount: number;
  isThinking: boolean;
  currentPlanStep: number;
  contextTokens?: number;
  maxContextTokens?: number;
  tokenUsage?: TokenUsage;
  modifiedFilesCount?: number;
}

export interface ReplActivityRow {
  glyph: "✓" | "×" | "·";
  tool: string;
  target: string;
  meta: string;
}

export function createReplDisplayState(input: {
  mode: string;
  model: string;
  cwd: string;
  gitSummary?: string;
}): ReplDisplayState {
  return {
    mode: input.mode,
    model: input.model,
    cwd: input.cwd,
    ...(input.gitSummary === undefined ? {} : { gitSummary: input.gitSummary }),
    step: 0,
    maxSteps: 0,
    sessionStatus: "idle",
    plannedToolCalls: [],
    activityRows: [],
    hiddenActivityCount: 0,
    isThinking: false,
    currentPlanStep: 0,
  };
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

function toolTarget(toolCall: ToolCall): string {
  const args = (toolCall.arguments ?? {}) as Record<string, unknown>;
  if (typeof args.path === "string") {
    return shortPath(args.path);
  }
  if (typeof args.command === "string") {
    return args.command.length > 36 ? `${args.command.slice(0, 33)}…` : args.command;
  }
  if (typeof args.pattern === "string") {
    return `"${args.pattern}"`;
  }
  return "";
}

function toolCallFromRecord(record: Record<string, unknown>): ToolCall {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? "tool"),
    arguments:
      typeof record.arguments === "object" && record.arguments !== null
        ? (record.arguments as Record<string, unknown>)
        : {},
  };
}

function parseActivityRow(payload: Record<string, unknown>): ReplActivityRow | null {
  const line = formatToolCallLineFromResult(payload);
  if (!line) {
    return null;
  }
  const success = payload.success === true;
  const glyph = success ? "✓" : "×";
  const tc = payload.toolCall;
  if (typeof tc !== "object" || tc === null) {
    return { glyph, tool: "tool", target: "", meta: "" };
  }
  const record = tc as Record<string, unknown>;
  const name = String(record.name ?? "tool");
  const target = toolTarget(toolCallFromRecord(record));
  const parts: string[] = [];
  if (typeof payload.exitCode === "number") {
    parts.push(`exit ${payload.exitCode}`);
  }
  if (typeof payload.durationMs === "number") {
    parts.push(formatDuration(payload.durationMs));
  }
  if (!success && typeof payload.error === "string") {
    parts.push(payload.error.slice(0, 24));
  }
  return { glyph, tool: name, target, meta: parts.join(" · ") };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}

export function renderReplStatusBar(state: ReplDisplayState, stream?: NodeJS.WriteStream): string {
  const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
  const statusGlyph =
    state.sessionStatus === "running" || state.sessionStatus === "retrying"
      ? theme.green("● running", stream)
      : theme.dim(state.sessionStatus, stream);
  const step =
    state.maxSteps > 0 ? `step ${state.step}/${state.maxSteps}` : `step ${state.step}`;
  const git = state.gitSummary ? `git: ${state.gitSummary}` : "git: n/a";
  const ctx =
    state.contextTokens === undefined
      ? undefined
      : formatContextUsage(state.contextTokens, state.maxContextTokens);
  return [
    theme.bold("code-mind", stream),
    theme.dim(`mode: ${state.mode}`, stream),
    theme.dim(`model: ${state.model}`, stream),
    theme.dim(git, stream),
    theme.dim(`cwd: ${shortPath(state.cwd)}`, stream),
    theme.dim(step, stream),
    ...(ctx === undefined ? [] : [theme.dim(`ctx: ${ctx}`, stream)]),
    statusGlyph,
    theme.dim(time, stream),
  ].join("  ");
}

export function renderReplPlan(state: ReplDisplayState, stream?: NodeJS.WriteStream): string[] {
  if (state.plannedToolCalls.length === 0 && state.maxSteps === 0) {
    return [];
  }
  const lines: string[] = [theme.bold(`Plan (${state.maxSteps || "?"} steps)`, stream)];
  const steps = state.plannedToolCalls.length > 0
    ? state.plannedToolCalls.map((call, index) => ({
        label: describeToolIntent(call).replace(/^Read |^List |^Search |^Run /, ""),
        index: index + 1,
        status: index < state.currentPlanStep ? "done" : index === state.currentPlanStep ? "current" : "pending",
      }))
    : [
        {
          label: activityLabel(state.isThinking ? "thinking" : "reading"),
          index: state.step || 1,
          status: state.isThinking ? "current" : "done",
        },
      ];

  for (const step of steps.slice(0, 6)) {
    const prefix =
      step.status === "done"
        ? theme.green("✓", stream)
        : step.status === "current"
          ? theme.yellow("→", stream)
          : theme.dim("·", stream);
    lines.push(`  ${step.index}. ${truncate(step.label, 52).padEnd(54)} ${prefix}`);
  }
  lines.push("");
  return lines;
}

function padColumn(value: string, width: number): string {
  if (value.length >= width) {
    return value.slice(0, width - 1) + "…";
  }
  return value.padEnd(width);
}

export function renderReplActivitySection(
  state: ReplDisplayState,
  stream?: NodeJS.WriteStream,
): string[] {
  const lines: string[] = [theme.bold("Activity (latest)", stream)];
  const visible = state.activityRows.slice(-MAX_VISIBLE_ACTIVITY);
  for (const row of visible) {
    const glyph = row.glyph === "✓" ? theme.green("✓", stream) : row.glyph === "×" ? theme.red("×", stream) : theme.dim("·", stream);
    lines.push(
      `  ${glyph} ${padColumn(row.tool, 14)} ${padColumn(row.target, 28)} ${theme.dim(row.meta, stream)}`.trimEnd(),
    );
  }

  if (state.isThinking && state.thinkingFocus) {
    const focus = truncate(state.thinkingFocus, 42);
    lines.push(
      `  ${theme.yellow("> … thinking", stream)}       ${theme.yellow(focus, stream)}       ${theme.dim("[enter] /reason", stream)}`,
    );
  }

  if (state.hiddenActivityCount > 0) {
    lines.push(theme.dim(`  … ${state.hiddenActivityCount} more events ›`, stream));
  }

  lines.push("");
  return lines;
}

export function renderReplHints(stream?: NodeJS.WriteStream): string {
  return theme.dim("Hints: /status  /diff  /reason  /permissions  /model  /help", stream);
}

export function renderReplComposerHints(stream?: NodeJS.WriteStream): string {
  return theme.dim(
    "Press ↑/↓ to navigate · Enter on empty line expands thinking · / for commands · Ctrl+C to interrupt",
    stream,
  );
}

export function renderReplThinkingPanel(state: ReplDisplayState, stream?: NodeJS.WriteStream): string {
  const lines = [
    "",
    theme.yellow("THINKING（当前思考）", stream),
    "",
    "Current focus",
    `  ${state.thinkingFocus ?? "Analyzing the current task."}`,
    "",
    "Next action",
    `  ${state.nextAction ?? "Continue with the next tool call or summarize findings."}`,
    "",
    theme.dim("r 查看完整推理摘要 (/reason)   e 打开相关文件 (/expand)   q 关闭", stream),
    "",
  ];
  return lines.join("\n");
}

export function renderReplReasonSummary(state: ReplDisplayState, stream?: NodeJS.WriteStream): string {
  const preview = state.reasoningPreview ?? state.thinkingFocus ?? "No reasoning summary available yet.";
  const lines = [
    "",
    theme.magenta("REASONING SUMMARY（推理摘要）", stream),
    "",
    "Hypothesis",
    `  ${truncate(preview, 180)}`,
    "",
    "Evidence",
    ...state.activityRows.slice(-3).map((row) => `  - ${row.tool} ${row.target} ${row.meta}`.trim()),
    "",
    "Decision",
    `  ${state.nextAction ?? "Proceed with the smallest safe change based on current evidence."}`,
    "",
    theme.dim("s 查看详情 (/expand)   q 关闭", stream),
    "",
  ];
  return lines.join("\n");
}

export interface ReplEventOutput {
  statusBar?: boolean;
  lines: string[];
}

/** Lightweight REPL event handler aligned with design mockup. */
export function handleReplDisplayEvent(
  state: ReplDisplayState,
  event: AgentEvent,
): ReplEventOutput {
  const p = event.payload;
  const out: ReplEventOutput = { lines: [] };

  switch (event.kind) {
    case "turn.started":
      state.maxSteps = typeof p.maxSteps === "number" ? p.maxSteps : state.maxSteps;
      state.sessionStatus = "running";
      if (typeof p.modelName === "string" && p.modelName.length > 0) {
        state.model = p.modelName;
      }
      state.activityRows = [];
      state.hiddenActivityCount = 0;
      state.plannedToolCalls = [];
      state.currentPlanStep = 0;
      out.statusBar = true;
      break;
    case "step.started":
      state.step = typeof p.step === "number" ? p.step : state.step;
      state.maxSteps = typeof p.maxSteps === "number" ? p.maxSteps : state.maxSteps;
      out.statusBar = true;
      break;
    case "model.request":
      state.isThinking = true;
      state.sessionStatus = "running";
      if (typeof p.contextTokens === "number") {
        state.contextTokens = p.contextTokens;
      }
      if (typeof p.maxContextTokens === "number") {
        state.maxContextTokens = p.maxContextTokens;
      }
      if (!state.thinkingFocus) {
        state.thinkingFocus = `step ${state.step}/${state.maxSteps || "?"}`;
      }
      out.lines.push(...renderReplActivitySection(state));
      out.statusBar = true;
      break;
    case "model.response": {
      state.isThinking = false;
      if (typeof p.contextTokens === "number") {
        state.contextTokens = p.contextTokens;
      }
      if (typeof p.maxContextTokens === "number") {
        state.maxContextTokens = p.maxContextTokens;
      }
      if (p.usage && typeof p.usage === "object") {
        state.tokenUsage = p.usage as TokenUsage;
      }
      const toolCallCount = typeof p.toolCallCount === "number" ? p.toolCallCount : 0;
      const textPreview = typeof p.textPreview === "string" ? p.textPreview.trim() : "";
      if (textPreview) {
        state.reasoningPreview = textPreview;
        state.thinkingFocus = truncate(textPreview.split(/[.!?]/)[0] ?? textPreview, 56);
        if (toolCallCount === 0) {
          state.assistantBrief = textPreview;
        }
      }
      if (toolCallCount > 0) {
        state.plannedToolCalls = payloadToolCalls(p, "plannedToolCalls");
        const firstPlanned = state.plannedToolCalls[0];
        if (firstPlanned !== undefined) {
          state.nextAction = describeToolIntent(firstPlanned);
        }
        out.lines.push(...renderReplPlan(state));
      }
      out.statusBar = true;
      break;
    }
    case "tool.result": {
      const row = parseActivityRow(p);
      if (row) {
        if (state.activityRows.length >= MAX_VISIBLE_ACTIVITY) {
          state.hiddenActivityCount += 1;
        }
        state.activityRows.push(row);
        state.currentPlanStep += 1;
      }
      state.isThinking = false;
      out.lines.push(...renderReplActivitySection(state));
      out.statusBar = true;
      break;
    }
    case "activity.updated":
      if (typeof p.detail === "string" && p.detail.length > 0) {
        state.thinkingFocus = p.detail;
      } else if (typeof p.activity === "string") {
        state.thinkingFocus = activityLabel(p.activity as ActivityKind).toLowerCase();
      }
      state.isThinking = true;
      out.lines.push(...renderReplActivitySection(state));
      out.statusBar = true;
      break;
    case "turn.finished":
      state.sessionStatus = typeof p.status === "string" ? p.status : "idle";
      state.isThinking = false;
      state.step = typeof p.steps === "number" ? p.steps : state.step;
      if (typeof p.modifiedFilesCount === "number") {
        state.modifiedFilesCount = p.modifiedFilesCount;
      }
      if (p.tokenUsage && typeof p.tokenUsage === "object") {
        state.tokenUsage = p.tokenUsage as TokenUsage;
      }
      if (typeof p.contextTokens === "number") {
        state.contextTokens = p.contextTokens;
      }
      if (typeof p.maxContextTokens === "number") {
        state.maxContextTokens = p.maxContextTokens;
      }
      out.statusBar = true;
      break;
    default:
      break;
  }

  return out;
}

export function renderReplUserLine(text: string, stream?: NodeJS.WriteStream): string {
  return `${theme.blue("user", stream)}  ${text}`;
}

export function renderReplAssistantBrief(state: ReplDisplayState, stream?: NodeJS.WriteStream): string[] {
  if (!state.assistantBrief?.trim()) {
    return [];
  }
  return [
    theme.blue("assistant", stream),
    `  ${state.assistantBrief.trim()}`,
    "",
  ];
}
