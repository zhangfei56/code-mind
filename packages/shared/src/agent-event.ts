import { createId } from "./ids.js";
import { nowIso } from "./time.js";
import type { AgentResultStatus } from "./types.js";

export type EventLevel = "error" | "warn" | "info" | "debug" | "trace";

export type EventSurface = "cli" | "repl" | "api" | "subagent" | "hook" | "mcp" | "system";

export type EventKind =
  | "run.started"
  | "run.finished"
  | "step.started"
  | "step.finished"
  | "turn.started"
  | "turn.finished"
  | "closing_turn.started"
  | "activity.updated"
  | "model.request"
  | "model.reasoning.delta"
  | "model.content.delta"
  | "model.response"
  | "tool.call"
  | "tool.result"
  | "message.user"
  | "message.assistant"
  | "patch.applied"
  | "permission.decision"
  | "approval.requested"
  | "approval.resolved"
  | "plan.entered"
  | "plan.exited"
  | "mode.changed"
  | "subagent.spawned"
  | "subagent.finished"
  | "verification.started"
  | "verification.finished"
  | "context.compacted"
  | "recovery.triggered"
  | "kernel.transition"
  | "hook.executed"
  | "process.log";

export interface EventSource {
  component: string;
  surface: EventSurface;
}

export interface EventCorrelation {
  parentRunId?: string;
  step?: number;
  toolCallId?: string;
  modelCallId?: string;
  traceId?: string;
}

export interface ArtifactRef {
  id: string;
  kind: "prompt" | "tool_output" | "diff" | "blob";
  bytes?: number;
  sha256?: string;
  preview?: string;
}

export interface AgentEvent {
  id: string;
  ts: string;
  runId: string;
  sessionId: string;
  seq: number;
  kind: EventKind;
  level: EventLevel;
  source: EventSource;
  correlation?: EventCorrelation;
  payload: Record<string, unknown>;
  refs?: ArtifactRef[];
}

export interface AgentEventInput {
  kind: EventKind;
  level?: EventLevel;
  source?: Partial<EventSource>;
  correlation?: EventCorrelation;
  payload?: Record<string, unknown>;
  refs?: ArtifactRef[];
}

export interface RunEmitContext {
  runId: string;
  sessionId: string;
  source: EventSource;
}

export interface AgentEventBus {
  readonly runId: string;
  readonly sessionId: string;
  emit(event: AgentEventInput): Promise<AgentEvent>;
  flush(): Promise<void>;
  finish(status: AgentResultStatus): Promise<void>;
  subscribe(listener: (event: AgentEvent) => void | Promise<void>): () => void;
  emitProcessLog(
    component: string,
    message: string,
    metadata?: Record<string, unknown>,
    level?: EventLevel,
  ): Promise<void>;
}

export function defaultLevelForKind(kind: EventKind): EventLevel {
  switch (kind) {
    case "process.log":
    case "model.reasoning.delta":
    case "model.content.delta":
      return "debug";
    case "model.response":
    case "tool.result":
    case "recovery.triggered":
    case "kernel.transition":
      return "debug";
    case "permission.decision":
    case "approval.requested":
    case "approval.resolved":
      return "info";
    default:
      return "info";
  }
}

export function buildAgentEvent(
  ctx: RunEmitContext,
  seq: number,
  input: AgentEventInput,
): AgentEvent {
  return {
    id: createId("evt"),
    ts: nowIso(),
    runId: ctx.runId,
    sessionId: ctx.sessionId,
    seq,
    kind: input.kind,
    level: input.level ?? defaultLevelForKind(input.kind),
    source: {
      component: input.source?.component ?? ctx.source.component,
      surface: input.source?.surface ?? ctx.source.surface,
    },
    ...(input.correlation === undefined ? {} : { correlation: input.correlation }),
    payload: input.payload ?? {},
    ...(input.refs === undefined ? {} : { refs: input.refs }),
  };
}
