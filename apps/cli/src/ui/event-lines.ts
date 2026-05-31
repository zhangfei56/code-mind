import type { AgentEvent, ActivityKind, EventKind, TokenUsage, ToolCall } from "@code-mind/shared";
import type { DisplayLevel } from "./display-level.js";
import { isTokenStreamEvent } from "./display-level.js";
import { formatContextUsage, formatDuration, formatTokenUsageSummary } from "./format.js";
import { formatStepHeader } from "./agent-output/step-title.js";
import { formatToolBlockFromPayload } from "./agent-output/tool-blocks.js";

function num(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === "number" ? value : undefined;
}

function str(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

function formatCompactionEventLine(p: Record<string, unknown>): string {
  const strategy = str(p, "strategy") ?? "llm";
  const compactionCount = num(p, "compactionCount") ?? 0;
  const evictedMessages = num(p, "evictedMessageCount");
  const evictedObservations = num(p, "evictedObservationCount");
  const retainedMessages = num(p, "messageCount") ?? 0;
  const evictedTotal =
    evictedMessages !== undefined || evictedObservations !== undefined
      ? (evictedMessages ?? 0) + (evictedObservations ?? 0)
      : undefined;
  const blocks =
    evictedTotal !== undefined && evictedTotal > 0
      ? `${evictedTotal} blocks → summary`
      : `${retainedMessages} msgs retained`;
  return `context compacted · ${strategy} · ×${compactionCount} · ${blocks}`;
}

function toolCall(payload: Record<string, unknown>): ToolCall | undefined {
  const value = payload.toolCall;
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? "unknown"),
    arguments:
      typeof record.arguments === "object" && record.arguments !== null
        ? (record.arguments as Record<string, unknown>)
        : {},
  };
}

/** Events recorded for audit but not rendered as CLI progress lines. */
export function isCliInternalEvent(kind: EventKind): boolean {
  return (
    isTokenStreamEvent(kind) ||
    kind === "process.log" ||
    kind === "message.user" ||
    kind === "message.assistant"
  );
}

export function formatTraceModelLine(event: AgentEvent): string | null {
  const p = event.payload;
  const parts = [
    `ctx ${formatContextUsage(num(p, "contextTokens") ?? 0, num(p, "maxContextTokens"))}`,
  ];
  const usage = p.usage as TokenUsage | undefined;
  if (usage) {
    parts.push(formatTokenUsageSummary(usage));
  }
  const durationMs = num(p, "durationMs");
  if (durationMs !== undefined) {
    parts.push(formatDuration(durationMs));
  }
  const reasoningLength = num(p, "reasoningLength");
  if (reasoningLength !== undefined && reasoningLength > 0) {
    parts.push(`reasoning ${reasoningLength} chars`);
  }
  const textPreview = str(p, "textPreview");
  if (textPreview) {
    parts.push(textPreview.slice(0, 80));
  }
  return parts.join(" · ");
}

function renderModelResponseLine(
  event: AgentEvent,
  options: { verbose?: boolean; trace?: boolean },
): string | null {
  const p = event.payload;
  const toolCallCount = num(p, "toolCallCount") ?? 0;
  const durationMs = num(p, "durationMs");
  const reasoningLength = num(p, "reasoningLength");

  if (toolCallCount > 0) {
    const parts = [`model → ${toolCallCount} tool call${toolCallCount === 1 ? "" : "s"}`];
    if (options.trace && durationMs !== undefined) {
      parts.push(formatDuration(durationMs));
    }
    if (options.trace && reasoningLength !== undefined && reasoningLength > 0) {
      parts.push(`reasoning ${reasoningLength} chars`);
    }
    if (options.trace) {
      parts.push(
        `ctx ${formatContextUsage(num(p, "contextTokens") ?? 0, num(p, "maxContextTokens"))}`,
      );
      const usage = p.usage as TokenUsage | undefined;
      if (usage) {
        parts.push(formatTokenUsageSummary(usage));
      }
    }
    return parts.join(" · ");
  }

  if (options.trace) {
    const trace = formatTraceModelLine(event);
    if (trace) {
      return trace;
    }
  }

  const textPreview = str(p, "textPreview");
  return options.verbose && textPreview
    ? `model done · ${textPreview.slice(0, 80)}`
    : "model done";
}

export function renderProgressJournalLine(
  event: AgentEvent,
  context: { activity?: ActivityKind; level?: DisplayLevel } = {},
): string | null {
  const level = context.level ?? 0;
  const p = event.payload;
  switch (event.kind) {
    case "step.started":
      return formatStepHeader(
        num(p, "step") ?? 0,
        num(p, "maxSteps") ?? 0,
        context.activity ?? "thinking",
      );
    case "model.response":
      if ((num(p, "toolCallCount") ?? 0) > 0) {
        return null;
      }
      return "  ✓ Summarized";
    case "tool.result": {
      const lines = formatToolBlockFromPayload(p, { level });
      return lines[0] ?? null;
    }
    case "verification.finished":
      return p.passed === true
        ? "  ✓ Validation passed"
        : `  × Validation failed · ${str(p, "summary") ?? ""}`;
    case "context.compacted":
      return `  ~ ${formatCompactionEventLine(p)}`;
    case "context.compaction_failed":
      return `  ~ context compaction failed · ${str(p, "reason") ?? "unknown"}`;
    default:
      return null;
  }
}

export function renderAgentEventLine(
  event: AgentEvent,
  options: { verbose?: boolean; trace?: boolean } = {},
): string | null {
  if (isCliInternalEvent(event.kind)) {
    return null;
  }

  const p = event.payload;
  switch (event.kind) {
    case "run.started":
      return `run ${event.runId.slice(0, 12)}… · ${str(p, "mode")} · ${str(p, "model")}`;
    case "turn.started":
      return `session ${event.sessionId.slice(0, 12)}… · ${str(p, "mode")} · ${str(p, "modelName")} · budget ${num(p, "maxSteps")}`;
    case "activity.updated":
      return str(p, "detail")
        ? `activity → ${String(p.activity)} · ${str(p, "detail")}`
        : `activity → ${String(p.activity)}`;
    case "closing_turn.started":
      return `closing turn · step ${num(p, "step")} · ${str(p, "reason")}`;
    case "plan.entered":
      return `plan mode entered · draft ${str(p, "draftPath")}`;
    case "plan.exited":
      return p.approved === true
        ? `plan approved · restore ${str(p, "preMode")}`
        : `plan rejected · restore ${str(p, "preMode")}`;
    case "mode.changed":
      return `mode ${str(p, "from")} → ${str(p, "to")} (${str(p, "source")})`;
    case "step.started":
      return `step ${num(p, "step")}/${num(p, "maxSteps")}`;
    case "model.request":
      return options.verbose || options.trace
        ? `thinking · step ${num(p, "step")}/${num(p, "maxSteps")} · ${num(p, "messageCount")} msgs${p.streaming === true ? " · stream" : ""}`
        : `thinking · step ${num(p, "step")}/${num(p, "maxSteps")}`;
    case "model.response":
      return renderModelResponseLine(event, options);
    case "tool.call": {
      const call = toolCall(p);
      return call ? `tool → ${call.name}` : "tool → unknown";
    }
    case "tool.result": {
      const call = toolCall(p);
      const durationMs = num(p, "durationMs");
      const duration =
        options.trace && durationMs !== undefined ? ` · ${formatDuration(durationMs)}` : "";
      return p.success === true
        ? `tool ✓ ${call?.name ?? "unknown"}${duration}`
        : `tool ✕ ${call?.name ?? "unknown"}: ${str(p, "error") ?? "failed"}${duration}`;
    }
    case "permission.decision":
      return `permission · ${str(p, "toolName") ?? "tool"} · ${str(p, "decision") ?? "unknown"}`;
    case "approval.requested": {
      const call = toolCall(p);
      return `approval · ${call?.name ?? "unknown"}: ${str(p, "reason") ?? ""}`;
    }
    case "subagent.spawned":
      return `subagent → ${str(p, "agentName")} · ${(str(p, "task") ?? "").slice(0, 80)}`;
    case "subagent.finished":
      return p.success === true
        ? `subagent ✓ ${str(p, "agentName")} · ${(str(p, "childSessionId") ?? "").slice(0, 12)}…`
        : `subagent ✕ ${str(p, "agentName")}`;
    case "verification.started":
      return "verification started";
    case "verification.finished":
      return p.passed === true
        ? "verification passed"
        : `verification failed: ${str(p, "summary") ?? ""}`;
    case "context.compacted":
      return formatCompactionEventLine(p);
    case "context.compaction_failed":
      return `context compaction failed · ${str(p, "reason") ?? "unknown"}`;
    case "turn.finished": {
      const steps = num(p, "steps") ?? 0;
      const parts = [`done · ${str(p, "status")} · ${steps} step${steps === 1 ? "" : "s"}`];
      const modifiedFilesCount = num(p, "modifiedFilesCount");
      if (modifiedFilesCount && modifiedFilesCount > 0) {
        parts.push(`${modifiedFilesCount} files changed`);
      }
      if (options.trace && p.tokenUsage) {
        parts.push(formatTokenUsageSummary(p.tokenUsage as TokenUsage));
      }
      if (options.verbose) {
        parts.push(`${str(p, "mode")} · ${str(p, "completion")}`);
      }
      return parts.join(" · ");
    }
    default:
      return options.trace ? `${event.kind} · seq ${event.seq}` : null;
  }
}