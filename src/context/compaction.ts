import type { AgentSession, InternalMessage, Observation } from "../shared/types.js";

const DEFAULT_COMPACTION_CHAR_THRESHOLD = 18_000;
const DEFAULT_RETAINED_MESSAGES = 8;
const DEFAULT_RETAINED_OBSERVATIONS = 8;

function estimateMessageSize(messages: InternalMessage[]): number {
  return messages.reduce((total, message) => total + message.content.length, 0);
}

function summarizeMessages(messages: InternalMessage[]): string[] {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .slice(-12)
    .map((message) => `- ${message.role}: ${message.content.trim().replace(/\s+/g, " ").slice(0, 240)}`);
}

function summarizeObservations(observations: Observation[]): string[] {
  return observations
    .slice(-10)
    .map((observation) => {
      const detail = observation.toolResult.success
        ? observation.toolResult.output
        : observation.toolResult.error ?? observation.toolResult.output;
      return `- ${observation.toolCall.name}: ${detail.replace(/\s+/g, " ").slice(0, 240)}`;
    });
}

export function shouldCompact(session: AgentSession): boolean {
  return estimateMessageSize(session.messages) >= DEFAULT_COMPACTION_CHAR_THRESHOLD;
}

export function buildCompactionSummary(session: AgentSession): string {
  const compactionIndex =
    typeof session.metadata?.compactionCount === "number"
      ? session.metadata.compactionCount + 1
      : 1;

  return [
    `# Compaction ${compactionIndex}`,
    "",
    "## Task",
    "",
    `- ${session.task.text}`,
    "",
    "## Recent Conversation",
    "",
    ...summarizeMessages(session.messages.slice(0, -DEFAULT_RETAINED_MESSAGES)),
    "",
    "## Recent Tool Results",
    "",
    ...summarizeObservations(
      session.observations.slice(0, -DEFAULT_RETAINED_OBSERVATIONS),
    ),
  ].join("\n");
}

export function applyCompaction(
  session: AgentSession,
  summary: string,
): void {
  const previousSummary =
    typeof session.metadata?.compactionSummary === "string"
      ? session.metadata.compactionSummary
      : "";
  const nextSummary = previousSummary
    ? `${previousSummary}\n\n${summary}`
    : summary;

  session.metadata = {
    ...session.metadata,
    compactionSummary: nextSummary,
    compactionCount:
      typeof session.metadata?.compactionCount === "number"
        ? session.metadata.compactionCount + 1
        : 1,
  };
  session.messages = session.messages.slice(-DEFAULT_RETAINED_MESSAGES);
  session.observations = session.observations.slice(-DEFAULT_RETAINED_OBSERVATIONS);
}
