import type {
  ActivityKind,
  AgentEvent,
  AgentMode,
  AgentPlan,
  ApprovalRecord,
  SessionStatus,
  TokenUsage,
  ToolCall,
} from "@code-mind/shared";
import { activityLabel } from "@code-mind/shared";
import { toolPayloadToFinishedLike } from "../ui/agent-output/tool-blocks.js";
import { formatContextUsage, formatDuration } from "../ui/format.js";
import { describeToolIntent } from "../ui/agent-output/tool-intent.js";
import { shortPath } from "../ui/theme.js";

const DEFAULT_VISIBLE_ACTIVITY = 3;
const VERBOSE_VISIBLE_ACTIVITY = 8;

export type TuiOverlayPanel =
  | "thinking"
  | "reason"
  | "evidence"
  | "approval"
  | "permissions"
  | "help"
  | "status"
  | "context"
  | "events"
  | "error";
export interface TuiPlanStep {
  index: number;
  label: string;
  status: "done" | "current" | "pending";
}

export interface TuiActivityRow {
  glyph: "✓" | "×" | "·";
  tool: string;
  target: string;
  meta: string;
  outputPreview?: string;
}

export interface TuiConversationEntry {
  role: "user" | "assistant" | "system";
  text: string;
}

export interface TuiErrorCard {
  title: string;
  detail: string;
  hint: string;
}

export interface TuiState {
  cwd: string;
  model: string;
  mode: AgentMode;
  gitSummary?: string;
  step: number;
  maxSteps: number;
  sessionId?: string;
  status: SessionStatus;
  isThinking: boolean;
  thinkingFocus: string;
  thinkingPhase: string;
  nextAction: string;
  reasoningPreview: string;
  hypothesis: string;
  alternativeConsidered: string;
  agentPlan?: AgentPlan;
  planStepIndex: number;
  plannedToolCalls: ToolCall[];
  currentPlanStep: number;
  activityRows: TuiActivityRow[];
  hiddenActivityCount: number;
  conversation: TuiConversationEntry[];
  recentEvents: string[];
  overlay: TuiOverlayPanel | null;
  selectedRow: number;
  pendingApproval?: ApprovalRecord;
  pendingPlanText?: string;
  lastShellOutput?: string;
  evidenceText: string;
  diffSummary: string;
  toast: string;
  clock: string;
  verbose: boolean;
  showAllActivity: boolean;
  filesRead: string[];
  filesChanged: string[];
  commandsRun: number;
  compactionCount: number;
  promptMessageCount: number;
  lastContextTokens?: number;
  maxContextTokens?: number;
  tokenUsage?: TokenUsage;
  activityDetail: string;
  lastError?: TuiErrorCard;
  lastModelDurationMs?: number;
  turnStartedAtMs?: number;
  phaseStartedAtMs?: number;
}

export function createTuiState(input: {
  cwd: string;
  model: string;
  mode: AgentMode;
  gitSummary?: string;
}): TuiState {
  return {
    cwd: input.cwd,
    model: input.model,
    mode: input.mode,
    ...(input.gitSummary === undefined ? {} : { gitSummary: input.gitSummary }),
    step: 0,
    maxSteps: 0,
    status: "idle",
    isThinking: false,
    thinkingFocus: "Waiting for a task.",
    thinkingPhase: "",
    nextAction: "Type a task or slash command.",
    reasoningPreview: "",
    hypothesis: "",
    alternativeConsidered: "",
    planStepIndex: 0,
    plannedToolCalls: [],
    currentPlanStep: 0,
    activityRows: [],
    hiddenActivityCount: 0,
    conversation: [],
    recentEvents: [],
    overlay: null,
    selectedRow: 0,
    evidenceText: "No evidence yet.",
    diffSummary: "",
    toast: "Ready.",
    clock: currentClock(),
    verbose: false,
    showAllActivity: false,
    filesRead: [],
    filesChanged: [],
    commandsRun: 0,
    compactionCount: 0,
    promptMessageCount: 0,
    activityDetail: "",
  };
}

export function currentClock(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

export function addConversation(
  state: TuiState,
  role: TuiConversationEntry["role"],
  text: string,
): void {
  state.conversation.push({ role, text });
  state.conversation = state.conversation.slice(-8);
}

export function visibleActivityLimit(state: TuiState): number {
  if (state.verbose || state.showAllActivity) {
    return VERBOSE_VISIBLE_ACTIVITY;
  }
  return DEFAULT_VISIBLE_ACTIVITY;
}

export function visibleActivityRows(state: TuiState): TuiActivityRow[] {
  return state.activityRows.slice(-visibleActivityLimit(state));
}

export function tuiPlanSteps(state: TuiState): TuiPlanStep[] {
  if (state.agentPlan && state.agentPlan.steps.length > 0) {
    return state.agentPlan.steps.slice(0, 8).map((step, index) => {
      const planStatus = step.status;
      let status: TuiPlanStep["status"] = "pending";
      if (planStatus === "done" || planStatus === "skipped") {
        status = "done";
      } else if (planStatus === "running" || planStatus === "failed") {
        status = "current";
      } else if (index < state.planStepIndex) {
        status = "done";
      } else if (index === state.planStepIndex) {
        status = "current";
      }
      return {
        index: index + 1,
        label: step.title || step.description,
        status,
      };
    });
  }

  if (state.plannedToolCalls.length > 0) {
    return state.plannedToolCalls.slice(0, 6).map((call, index) => ({
      index: index + 1,
      label: describeToolIntent(call).replace(/^Read |^List |^Search |^Run /, ""),
      status:
        index < state.currentPlanStep
          ? "done"
          : index === state.currentPlanStep
            ? "current"
            : "pending",
    }));
  }

  if (state.maxSteps === 0 && state.step === 0) {
    return [];
  }

  return [
    {
      index: state.step || 1,
      label: activityLabel(state.isThinking ? "thinking" : "reading"),
      status: state.isThinking ? "current" : "done",
    },
  ];
}

export function setAgentPlan(state: TuiState, plan: AgentPlan): void {
  state.agentPlan = plan;
  state.planStepIndex = 0;
}

export function applyTuiEvent(state: TuiState, event: AgentEvent): void {
  state.clock = currentClock();
  rememberEvent(state, event);
  const p = event.payload;

  switch (event.kind) {
    case "turn.started":
      state.turnStartedAtMs = Date.now();
      state.phaseStartedAtMs = state.turnStartedAtMs;
      state.sessionId = event.sessionId;
      state.maxSteps = numberValue(p.maxSteps, state.maxSteps);
      state.status = "running";
      state.isThinking = true;
      state.thinkingFocus = "Starting turn.";
      state.thinkingPhase = "starting";
      state.nextAction = "Build context and call the model.";
      state.activityRows = [];
      state.hiddenActivityCount = 0;
      state.plannedToolCalls = [];
      state.currentPlanStep = 0;
      state.planStepIndex = 0;
      state.showAllActivity = false;
      delete state.lastError;
      state.toast = "Turn started.";
      if (typeof p.modelName === "string" && p.modelName.length > 0) {
        state.model = p.modelName;
      }
      break;
    case "step.started":
      state.phaseStartedAtMs = Date.now();
      state.step = numberValue(p.step, state.step);
      state.maxSteps = numberValue(p.maxSteps, state.maxSteps);
      state.status = "running";
      state.planStepIndex = Math.min(
        Math.max(0, state.step - 1),
        Math.max(0, (state.agentPlan?.steps.length ?? 1) - 1),
      );
      state.toast = `Step ${state.step}/${state.maxSteps || "?"}.`;
      break;
    case "activity.updated":
      state.phaseStartedAtMs = Date.now();
      state.status = "running";
      state.isThinking = true;
      if (typeof p.detail === "string" && p.detail.length > 0) {
        state.thinkingFocus = p.detail;
        state.activityDetail = p.detail;
      } else if (typeof p.activity === "string") {
        const label = activityLabel(p.activity as ActivityKind).toLowerCase();
        state.thinkingFocus = label;
        state.thinkingPhase = label;
        state.activityDetail = label;
      }
      state.nextAction = "Continue with the next model or tool action.";
      break;
    case "model.request":
      state.phaseStartedAtMs = Date.now();
      state.status = "running";
      state.isThinking = true;
      state.thinkingPhase = "thinking";
      state.thinkingFocus = `Thinking at step ${state.step || numberValue(p.step, 0)}/${state.maxSteps || numberValue(p.maxSteps, 0) || "?"}.`;
      state.nextAction = "Compare available evidence and choose the next action.";
      if (typeof p.messageCount === "number") {
        state.promptMessageCount = p.messageCount;
      }
      if (typeof p.contextTokens === "number") {
        state.lastContextTokens = p.contextTokens;
      }
      if (typeof p.maxContextTokens === "number") {
        state.maxContextTokens = p.maxContextTokens;
      }
      break;
    case "model.content.delta": {
      const delta = typeof p.delta === "string" ? p.delta : "";
      if (delta.length > 0) {
        state.isThinking = true;
        state.thinkingPhase = "forming response";
        state.thinkingFocus = truncate((state.thinkingFocus + delta).trim(), 72);
      }
      break;
    }
    case "model.reasoning.delta": {
      const delta = typeof p.delta === "string" ? p.delta : "";
      if (delta.length > 0) {
        state.isThinking = true;
        state.thinkingPhase = "reasoning";
        const combined = (state.reasoningPreview + delta).trim();
        state.reasoningPreview = truncate(combined, 2000);
        state.thinkingFocus = firstSentence(combined);
      }
      break;
    }
    case "model.response": {
      state.isThinking = false;
      state.thinkingPhase = "";
      const textPreview = typeof p.textPreview === "string" ? p.textPreview.trim() : "";
      const toolCallCount = numberValue(p.toolCallCount, 0);
      if (typeof p.durationMs === "number") {
        state.lastModelDurationMs = p.durationMs;
      }
      if (typeof p.contextTokens === "number") {
        state.lastContextTokens = p.contextTokens;
      }
      if (typeof p.maxContextTokens === "number") {
        state.maxContextTokens = p.maxContextTokens;
      }
      if (textPreview.length > 0) {
        state.reasoningPreview = textPreview;
        state.hypothesis = firstSentence(textPreview);
        state.thinkingFocus = state.hypothesis;
        if (toolCallCount === 0) {
          addConversation(state, "assistant", textPreview);
        } else if (!state.conversation.some((entry) => entry.role === "assistant")) {
          addConversation(state, "assistant", firstSentence(textPreview));
        }
      }
      const planned = payloadToolCalls(p, "plannedToolCalls");
      if (planned.length > 0) {
        state.plannedToolCalls = planned;
        state.nextAction = describeToolIntent(planned[0]!);
      } else if (toolCallCount === 0) {
        state.nextAction = "Prepare final response.";
      }
      state.toast = toolCallCount > 0 ? `Planned ${toolCallCount} tool call(s).` : "Model answered.";
      break;
    }
    case "tool.call": {
      state.phaseStartedAtMs = Date.now();
      const toolCall = toolCallFromPayload(p);
      if (toolCall) {
        state.thinkingFocus = describeToolIntent(toolCall);
        state.thinkingPhase = toolCall.name;
        state.nextAction = `Run ${toolCall.name}.`;
      }
      state.status = "running";
      state.isThinking = true;
      break;
    }
    case "tool.result": {
      const row = parseActivityRow(p);
      if (row) {
        const limit = visibleActivityLimit(state);
        if (state.activityRows.length >= limit) {
          state.hiddenActivityCount += 1;
        }
        state.activityRows.push(row);
        state.currentPlanStep += 1;
        state.evidenceText = evidenceFromToolResult(p, row);
        trackToolContext(state, p, row);
        if (row.glyph === "×") {
          state.lastError = buildErrorCard(row, p);
        } else {
          delete state.lastError;
        }
      }
      state.isThinking = false;
      state.thinkingPhase = "";
      state.toast = row?.glyph === "×" ? "Tool failed." : "Tool finished.";
      break;
    }
    case "approval.requested":
      state.phaseStartedAtMs = Date.now();
      state.status = "awaiting_approval";
      state.overlay = "approval";
      state.toast = "Approval required.";
      state.pendingApproval = approvalFromPayload(event.sessionId, p);
      break;
    case "approval.resolved":
      state.status = "running";
      delete state.pendingApproval;
      state.overlay = null;
      state.toast = "Approval resolved.";
      break;
    case "verification.started":
      state.phaseStartedAtMs = Date.now();
      state.thinkingFocus = "Running verification.";
      state.thinkingPhase = "verification";
      state.nextAction = "Check whether focused validation passes.";
      state.isThinking = true;
      break;
    case "verification.finished":
      state.isThinking = false;
      state.thinkingPhase = "";
      state.toast = p.passed === true ? "Verification passed." : "Verification failed.";
      state.evidenceText =
        typeof p.summary === "string"
          ? p.summary
          : p.passed === true
            ? "Verification passed."
            : "Verification failed.";
      break;
    case "context.compacted":
      state.compactionCount += 1;
      break;
    case "turn.finished":
      state.status = typeof p.status === "string" ? (p.status as SessionStatus) : "idle";
      state.step = numberValue(p.steps, state.step);
      state.isThinking = false;
      state.thinkingPhase = "";
      if (p.tokenUsage && typeof p.tokenUsage === "object") {
        state.tokenUsage = p.tokenUsage as TokenUsage;
      }
      if (typeof p.contextTokens === "number") {
        state.lastContextTokens = p.contextTokens;
      }
      if (typeof p.maxContextTokens === "number") {
        state.maxContextTokens = p.maxContextTokens;
      }
      state.toast = `Turn ${state.status}.`;
      break;
    default:
      break;
  }
}

function rememberEvent(state: TuiState, event: AgentEvent): void {
  const detail = event.kind === "tool.call"
    ? toolCallFromPayload(event.payload)?.name
    : event.kind === "tool.result"
      ? toolCallFromPayload(event.payload)?.name
      : event.kind === "activity.updated"
        ? typeof event.payload.activity === "string"
          ? event.payload.activity
          : undefined
        : undefined;
  state.recentEvents.push(
    detail ? `${event.seq}. ${event.kind} · ${detail}` : `${event.seq}. ${event.kind}`,
  );
  state.recentEvents = state.recentEvents.slice(-60);
}

export function setPendingApproval(state: TuiState, approval: ApprovalRecord): void {
  state.pendingApproval = approval;
  state.overlay = "approval";
  state.status = "awaiting_approval";
  state.toast = `Approval required: ${approval.toolName}.`;
}

export function statusLine(state: TuiState): string {
  const step =
    state.maxSteps > 0 ? `step ${state.step}/${state.maxSteps}` : state.step > 0 ? `step ${state.step}` : "step —";
  const git = state.gitSummary ?? "n/a";
  const running =
    state.status === "running" || state.status === "retrying"
      ? "{green-fg}● running{/green-fg}"
      : state.status === "awaiting_approval"
        ? "{yellow-fg}● approval{/yellow-fg}"
        : state.status === "idle"
          ? "{gray-fg}● idle{/gray-fg}"
          : `{gray-fg}● ${state.status}{/gray-fg}`;
  const verbose = state.verbose ? " {gray-fg}verbose{/gray-fg}" : "";
  const elapsed = state.phaseStartedAtMs
    ? ` {gray-fg}${formatElapsed(Date.now() - state.phaseStartedAtMs)}{/gray-fg}`
    : "";
  const ctx =
    state.lastContextTokens === undefined
      ? ""
      : ` {gray-fg}ctx ${formatContextUsage(state.lastContextTokens, state.maxContextTokens)}{/gray-fg}`;
  return [
    "{cyan-fg}{bold}code-mind{/bold}{/cyan-fg}",
    `{gray-fg}|{/gray-fg} {green-fg}${state.mode}{/green-fg}`,
    `{gray-fg}|{/gray-fg} {green-fg}${state.model}{/green-fg}`,
    `{gray-fg}|{/gray-fg} {gray-fg}${git}{/gray-fg}`,
    `{gray-fg}|{/gray-fg} {blue-fg}${step}{/blue-fg}`,
    `{gray-fg}|{/gray-fg} ${running}${elapsed}${ctx}${verbose}`,
  ].join(" ");
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${String(seconds % 60).padStart(2, "0")}s`;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function firstSentence(text: string): string {
  const sentence = text.split(/[.!?。！？]/)[0]?.trim() ?? text;
  return truncate(sentence || text, 72);
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

function toolCallFromPayload(payload: Record<string, unknown>): ToolCall | undefined {
  const raw = payload.toolCall;
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? "tool"),
    arguments:
      typeof record.arguments === "object" && record.arguments !== null
        ? (record.arguments as Record<string, unknown>)
        : {},
  };
}

function approvalFromPayload(sessionId: string, payload: Record<string, unknown>): ApprovalRecord {
  const toolCall = toolCallFromPayload(payload) ?? {
    id: String(payload.toolCallId ?? "unknown"),
    name: String(payload.toolName ?? "tool"),
    arguments: {},
  };
  return {
    id: String(payload.approvalId ?? "approval_pending"),
    sessionId,
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    reason: typeof payload.reason === "string" ? payload.reason : "This action needs explicit approval.",
    status: "pending",
    createdAt: new Date().toISOString(),
    metadata: {
      arguments: toolCall.arguments,
      ...(typeof payload.diffPreview === "string" ? { diffPreview: payload.diffPreview } : {}),
    },
  };
}

function toolTarget(toolCall: ToolCall): string {
  const args = toolCall.arguments ?? {};
  if (typeof args.path === "string") {
    return shortPath(args.path);
  }
  if (typeof args.command === "string") {
    return truncate(args.command, 34);
  }
  if (typeof args.pattern === "string") {
    return `"${truncate(args.pattern, 30)}"`;
  }
  if (typeof args.patch === "string") {
    return "patch";
  }
  return "";
}

function parseActivityRow(payload: Record<string, unknown>): TuiActivityRow | undefined {
  const toolCall = toolCallFromPayload(payload);
  if (!toolCall) {
    return undefined;
  }
  const success = payload.success === true;
  const parts: string[] = [];
  if (typeof payload.exitCode === "number") {
    parts.push(`exit ${payload.exitCode}`);
  }
  if (typeof payload.durationMs === "number") {
    parts.push(formatDuration(payload.durationMs));
  }
  if (!success && typeof payload.error === "string") {
    parts.push(truncate(payload.error, 24));
  }
  const outputPreview =
    typeof payload.outputPreview === "string"
      ? payload.outputPreview
      : typeof payload.error === "string"
        ? payload.error
        : undefined;
  return {
    glyph: success ? "✓" : "×",
    tool: toolCall.name,
    target: toolTarget(toolCall),
    meta: parts.join(" · "),
    ...(outputPreview === undefined ? {} : { outputPreview }),
  };
}

function evidenceFromToolResult(payload: Record<string, unknown>, row: TuiActivityRow): string {
  const lines = [`${row.tool} ${row.target} ${row.meta}`.trim()];
  const preview =
    typeof payload.outputPreview === "string"
      ? payload.outputPreview
      : typeof payload.error === "string"
        ? payload.error
        : "";
  if (preview.length > 0) {
    lines.push("", truncate(preview, 1200));
  }
  return lines.join("\n");
}

function trackToolContext(state: TuiState, payload: Record<string, unknown>, row: TuiActivityRow): void {
  const finished = toolPayloadToFinishedLike(payload);
  if (finished === null) {
    return;
  }
  const args = (finished.toolCall.arguments ?? {}) as Record<string, unknown>;
  if (finished.toolCall.name === "read_file" && typeof args.path === "string" && finished.success) {
    if (!state.filesRead.includes(args.path)) {
      state.filesRead.push(args.path);
    }
  }
  if (
    (finished.toolCall.name === "apply_patch" ||
      finished.toolCall.name === "write_file" ||
      finished.toolCall.name === "search_replace" ||
      finished.toolCall.name === "delete_file" ||
      finished.toolCall.name === "move_file") &&
    finished.success
  ) {
    const path =
      finished.filePath ??
      (typeof args.path === "string"
        ? args.path
        : typeof args.to === "string"
          ? args.to
          : "patched file");
    if (!state.filesChanged.includes(path)) {
      state.filesChanged.push(path);
    }
  }
  if (finished.toolCall.name === "run_shell") {
    const output = finished.outputPreview;
    if (output) {
      state.lastShellOutput = output;
    }
    if (finished.success) {
      state.commandsRun += 1;
    }
  }
  if (row.outputPreview) {
    state.evidenceText = evidenceFromToolResult(payload, row);
  }
}

function buildErrorCard(row: TuiActivityRow, payload: Record<string, unknown>): TuiErrorCard {
  const errorText = typeof payload.error === "string" ? payload.error : row.outputPreview ?? "Unknown error.";
  if (row.tool === "read_file") {
    return {
      title: "File not found",
      detail: row.target,
      hint: "The referenced file does not exist. Use /context or continue inspection.",
    };
  }
  return {
    title: row.tool === "run_shell" ? "Command failed" : "Tool failed",
    detail: `${row.target}${row.meta ? ` · ${row.meta}` : ""}`.trim(),
    hint: truncate(errorText, 120),
  };
}
