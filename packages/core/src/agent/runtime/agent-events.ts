import type { AgentEventInput, RuntimeInput } from "@code-mind/shared";
import type {
  ActivityKind,
  AgentMode,
  AgentResultStatus,
  CompletionKind,
  ModelResponse,
  PermissionDecision,
  TokenUsage,
  ToolCall,
} from "@code-mind/shared";

function stepCorrelation(step: number) {
  return { correlation: { step } };
}

export function turnStartedEvent(input: {
  modelName: string;
  maxSteps: number;
  requestedMaxSteps: number;
  baseMaxSteps: number;
  mode: AgentMode;
}): AgentEventInput {
  return {
    kind: "turn.started",
    payload: input,
  };
}

export function turnFinishedEvent(input: {
  status: AgentResultStatus;
  steps: number;
  finalText: string;
  mode: AgentMode;
  completion: CompletionKind;
  modifiedFilesCount?: number;
  tokenUsage?: TokenUsage;
  contextTokens?: number;
  maxContextTokens?: number;
}): AgentEventInput {
  return {
    kind: "turn.finished",
    payload: input,
  };
}

export function runFinishedEvent(status: AgentResultStatus): AgentEventInput {
  return {
    kind: "run.finished",
    level: status === "success" ? "info" : "warn",
    payload: { status },
  };
}

export function stepStartedEvent(step: number, maxSteps: number): AgentEventInput {
  return {
    kind: "step.started",
    ...stepCorrelation(step),
    payload: { step, maxSteps },
  };
}

export function stepFinishedEvent(step: number, maxSteps: number): AgentEventInput {
  return {
    kind: "step.finished",
    ...stepCorrelation(step),
    payload: { step, maxSteps },
  };
}

export function closingTurnStartedEvent(
  step: number,
  reason: "budget" | "policy" | "terminal",
): AgentEventInput {
  return {
    kind: "closing_turn.started",
    ...stepCorrelation(step),
    payload: { step, reason },
  };
}

export function activityUpdatedEvent(
  activity: ActivityKind,
  detail?: string,
  step?: number,
): AgentEventInput {
  return {
    kind: "activity.updated",
    ...(step === undefined ? {} : stepCorrelation(step)),
    payload: { activity, ...(detail === undefined ? {} : { detail }) },
  };
}

export function modelRequestEvent(
  step: number,
  maxSteps: number,
  messageCount: number,
  options: {
    streaming?: boolean;
    streamContent?: boolean;
    contextTokens?: number;
    maxContextTokens?: number;
  } = {},
): AgentEventInput {
  return {
    kind: "model.request",
    ...stepCorrelation(step),
    payload: {
      step,
      maxSteps,
      messageCount,
      ...(options.streaming === undefined ? {} : { streaming: options.streaming }),
      ...(options.streamContent === undefined ? {} : { streamContent: options.streamContent }),
      ...(options.contextTokens === undefined ? {} : { contextTokens: options.contextTokens }),
      ...(options.maxContextTokens === undefined
        ? {}
        : { maxContextTokens: options.maxContextTokens }),
    },
  };
}

export function modelReasoningDeltaEvent(
  step: number,
  delta: string,
  totalLength: number,
): AgentEventInput {
  return {
    kind: "model.reasoning.delta",
    level: "debug",
    ...stepCorrelation(step),
    payload: { step, delta, totalLength },
  };
}

export function modelContentDeltaEvent(
  step: number,
  delta: string,
  totalLength: number,
): AgentEventInput {
  return {
    kind: "model.content.delta",
    level: "debug",
    ...stepCorrelation(step),
    payload: { step, delta, totalLength },
  };
}

export function modelResponseEvent(input: {
  step: number;
  maxSteps: number;
  finishReason: ModelResponse["finishReason"];
  toolCallCount: number;
  durationMs?: number;
  textPreview?: string;
  reasoningLength?: number;
  plannedToolCalls?: ToolCall[];
  usage?: TokenUsage;
  contextTokens?: number;
  maxContextTokens?: number;
  streamed?: boolean;
}): AgentEventInput {
  return {
    kind: "model.response",
    ...stepCorrelation(input.step),
    payload: input,
  };
}

export function toolCallEvent(
  step: number,
  maxSteps: number,
  toolCall: ToolCall,
): AgentEventInput {
  return {
    kind: "tool.call",
    ...stepCorrelation(step),
    correlation: { step, toolCallId: toolCall.id },
    payload: { step, maxSteps, toolCall },
  };
}

export function toolResultEvent(input: {
  step: number;
  maxSteps: number;
  toolCall: ToolCall;
  success: boolean;
  error?: string;
  durationMs?: number;
  /** Full tool stdout/stderr transcript for replay; optional previews stay for concise logs. */
  output?: string;
  outputPreview?: string;
  exitCode?: number;
  filePath?: string;
}): AgentEventInput {
  return {
    kind: "tool.result",
    correlation: { step: input.step, toolCallId: input.toolCall.id },
    payload: input,
  };
}

export function messageUserEvent(content: string): AgentEventInput {
  return {
    kind: "message.user",
    payload: { content },
  };
}

export function messageAssistantEvent(
  content: string,
  toolCalls?: ToolCall[],
  finishReason?: string,
): AgentEventInput {
  return {
    kind: "message.assistant",
    payload: {
      content,
      ...(finishReason === undefined ? {} : { finishReason }),
      ...(toolCalls?.length ? { toolCalls } : {}),
    },
  };
}

export function patchAppliedEvent(filePath: string, metadata?: Record<string, unknown>): AgentEventInput {
  return {
    kind: "patch.applied",
    payload: { filePath, ...(metadata === undefined ? {} : { metadata }) },
  };
}

export function permissionDecisionEvent(input: {
  toolCallId: string;
  toolName: string;
  decision: PermissionDecision["type"];
  reason: string;
  step?: number;
}): AgentEventInput {
  return {
    kind: "permission.decision",
    correlation: { toolCallId: input.toolCallId, ...(input.step === undefined ? {} : { step: input.step }) },
    payload: input,
  };
}

export function approvalRequestedEvent(input: {
  step: number;
  maxSteps: number;
  toolCall: ToolCall;
  reason: string;
  approvalId?: string;
}): AgentEventInput {
  return {
    kind: "approval.requested",
    ...stepCorrelation(input.step),
    correlation: { step: input.step, toolCallId: input.toolCall.id },
    payload: input,
  };
}

export function approvalResolvedEvent(input: {
  step: number;
  toolCall: ToolCall;
  approved: boolean;
  approvalId?: string;
}): AgentEventInput {
  return {
    kind: "approval.resolved",
    ...stepCorrelation(input.step),
    correlation: { step: input.step, toolCallId: input.toolCall.id },
    payload: input,
  };
}

export function clarifyRequestedEvent(input: {
  clarifyId: string;
  question: string;
  taskText: string;
}): AgentEventInput {
  return {
    kind: "clarify.requested",
    payload: input,
  };
}

export function clarifyResolvedEvent(input: {
  clarifyId: string;
  answer: string;
  skipped?: boolean;
}): AgentEventInput {
  return {
    kind: "clarify.resolved",
    payload: input,
  };
}

export function skillConfirmRequestedEvent(input: {
  confirmId: string;
  pending: Array<{ name: string; score: number; reason: string }>;
  taskText: string;
}): AgentEventInput {
  return {
    kind: "skill.confirm.requested",
    payload: input,
  };
}

export function skillConfirmResolvedEvent(input: {
  confirmId: string;
  confirmed: string[];
  declined: string[];
}): AgentEventInput {
  return {
    kind: "skill.confirm.resolved",
    payload: input,
  };
}

export function planEnteredEvent(preMode: AgentMode, draftPath: string): AgentEventInput {
  return { kind: "plan.entered", payload: { preMode, draftPath } };
}

export function planExitedEvent(input: {
  approved: boolean;
  preMode: AgentMode;
  planPath?: string;
}): AgentEventInput {
  return { kind: "plan.exited", payload: input };
}

export function modeChangedEvent(
  from: AgentMode,
  to: AgentMode,
  source: "enter_plan" | "exit_plan" | "user",
): AgentEventInput {
  return { kind: "mode.changed", payload: { from, to, source } };
}

export function subagentSpawnedEvent(input: {
  step: number;
  maxSteps: number;
  agentName: string;
  task: string;
  parentSessionId: string;
  childSessionId: string;
}): AgentEventInput {
  return {
    kind: "subagent.spawned",
    ...stepCorrelation(input.step),
    payload: input,
  };
}

export function subagentFinishedEvent(input: {
  step: number;
  maxSteps: number;
  agentName: string;
  childSessionId: string;
  success: boolean;
  summaryPreview?: string;
}): AgentEventInput {
  return {
    kind: "subagent.finished",
    ...stepCorrelation(input.step),
    payload: input,
  };
}

export function verificationStartedEvent(input: {
  step: number;
  maxSteps: number;
  verificationId: string;
  cwd: string;
}): AgentEventInput {
  return {
    kind: "verification.started",
    ...stepCorrelation(input.step),
    payload: input,
  };
}

export function verificationFinishedEvent(input: {
  step: number;
  maxSteps: number;
  verificationId: string;
  passed: boolean;
  summary: string;
  error?: string;
}): AgentEventInput {
  return {
    kind: "verification.finished",
    ...stepCorrelation(input.step),
    payload: input,
  };
}

export function contextCompactedEvent(input: {
  step: number;
  maxSteps: number;
  compactionCount: number;
  messageCount: number;
  evictedMessageCount?: number;
  evictedObservationCount?: number;
  path?: string;
  strategy?: "llm";
  usage?: import("@code-mind/shared").TokenUsage;
  durationMs?: number;
}): AgentEventInput {
  return {
    kind: "context.compacted",
    ...stepCorrelation(input.step),
    payload: input,
  };
}

export function contextCompactionFailedEvent(input: {
  step: number;
  maxSteps: number;
  contextChars: number;
  reason: string;
  modelName: string;
  evictedMessageCount: number;
  evictedObservationCount: number;
  durationMs?: number;
}): AgentEventInput {
  return {
    kind: "context.compaction_failed",
    level: "warn",
    ...stepCorrelation(input.step),
    payload: input,
  };
}

export function hookExecutedEvent(input: {
  event: string;
  action: string;
  reason?: string;
}): AgentEventInput {
  return {
    kind: "hook.executed",
    level: "debug",
    payload: input,
  };
}

export function recoveryTriggeredEvent(payload: Record<string, unknown>): AgentEventInput {
  return {
    kind: "recovery.triggered",
    level: "warn",
    payload,
  };
}

export function kernelTransitionEvent(input: {
  eventType: string;
  fromPhase: string;
  toPhase: string;
  step: number;
  maxSteps: number;
  closingTurn: boolean;
  pendingToolCalls: number;
  commands: string[];
  checkpointReasons: string[];
  primaryCommand: string;
}): AgentEventInput {
  return {
    kind: "kernel.transition",
    level: "debug",
    correlation: { step: input.step },
    payload: input,
  };
}

export async function publish(
  input: RuntimeInput | undefined,
  event: AgentEventInput,
): Promise<void> {
  if (typeof input?.eventBus?.emit !== "function") {
    return;
  }
  await input.eventBus.emit(event);
}
