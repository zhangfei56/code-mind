import type {
  AgentSession,
  CompactionPolicy,
  CompactionSummarizeInput,
  InternalMessage,
  Observation,
} from "@code-mind/shared";
import { DEFAULT_COMPACTION_POLICY } from "@code-mind/shared";
import { resolveCompactionLocale } from "./compaction-locale.js";

function estimateMessageSize(messages: InternalMessage[]): number {
  return messages.reduce((total, message) => total + message.content.length, 0);
}

function estimateObservationSize(observations: Observation[]): number {
  return observations.reduce((total, observation) => {
    const detail = observation.toolResult.success
      ? observation.toolResult.output
      : (observation.toolResult.error ?? observation.toolResult.output);
    return total + detail.length;
  }, 0);
}

function resolveCompactionIndex(session: AgentSession): number {
  return typeof session.metadata?.compactionCount === "number"
    ? session.metadata.compactionCount + 1
    : 1;
}

export function estimateSessionContextChars(session: AgentSession): number {
  return estimateMessageSize(session.messages) + estimateObservationSize(session.observations);
}

export function shouldCompact(
  session: AgentSession,
  policy: CompactionPolicy = DEFAULT_COMPACTION_POLICY,
): boolean {
  return estimateSessionContextChars(session) >= policy.charThreshold;
}

export function hasCompactionEviction(
  input: CompactionSummarizeInput,
): boolean {
  return input.evictedMessages.length > 0 || input.evictedObservations.length > 0;
}

export function buildCompactionSummarizeInput(
  session: AgentSession,
  policy: CompactionPolicy = DEFAULT_COMPACTION_POLICY,
): CompactionSummarizeInput {
  const base: CompactionSummarizeInput = {
    taskText: session.task.text,
    previousSummary:
      typeof session.metadata?.compactionSummary === "string" &&
      session.metadata.compactionSummary.length > 0
        ? session.metadata.compactionSummary
        : undefined,
    evictedMessages: session.messages.slice(0, -policy.retainedMessages),
    evictedObservations: session.observations.slice(0, -policy.retainedObservations),
    compactionIndex: resolveCompactionIndex(session),
    locale: resolveCompactionLocale(session),
  };

  if (hasCompactionEviction(base) || !shouldCompact(session, policy)) {
    return base;
  }

  return {
    ...base,
    evictedMessages:
      session.messages.length > 1
        ? session.messages.slice(0, -1)
        : session.messages,
    evictedObservations: session.observations,
  };
}

/** Re-apply window retain after resume (events rebuild full history). */
export function applyCompactionWindowRetain(
  session: AgentSession,
  policy: CompactionPolicy = DEFAULT_COMPACTION_POLICY,
): void {
  if (typeof session.metadata?.compactionCount !== "number" || session.metadata.compactionCount < 1) {
    return;
  }
  session.messages = session.messages.slice(-policy.retainedMessages);
  session.observations = session.observations.slice(-policy.retainedObservations);
}

export function applyCompaction(
  session: AgentSession,
  summary: string,
  policy: CompactionPolicy = DEFAULT_COMPACTION_POLICY,
): void {
  session.metadata = {
    ...session.metadata,
    compactionSummary: summary,
    compactionCount:
      typeof session.metadata?.compactionCount === "number"
        ? session.metadata.compactionCount + 1
        : 1,
    compactionBlockedContextChars: undefined,
  };
  session.messages = session.messages.slice(-policy.retainedMessages);
  session.observations = session.observations.slice(-policy.retainedObservations);
}
