import { writeFile } from "node:fs/promises";
import type { AgentSession, Observation } from "../shared/types.js";

export async function writeSummary(
  summaryPath: string,
  summary: string,
): Promise<void> {
  await writeFile(summaryPath, summary, "utf8");
}

function formatObservation(observation: Observation): string {
  const status = observation.toolResult.success ? "success" : "failed";
  const detail = observation.toolResult.success
    ? observation.toolResult.output
    : observation.toolResult.error ?? observation.toolResult.output;
  return `- ${observation.toolCall.name}: ${status}${detail ? ` - ${detail}` : ""}`;
}

export function buildCurrentSummary(
  session: AgentSession,
  modelName: string,
  finalText?: string,
): string {
  const lastAssistantMessage = [...session.messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.content.trim().length > 0);
  const recentObservations = session.observations.slice(-5);

  const sections = [
    "# Current Summary",
    "",
    "## Task",
    "",
    `- ${session.task.text}`,
    "",
    "## Session",
    "",
    `- Mode: ${session.task.mode}`,
    `- Model: ${modelName}`,
    `- Messages: ${session.messages.length}`,
    `- Observations: ${session.observations.length}`,
    "",
    "## Recent Tool Results",
    "",
    ...(recentObservations.length > 0
      ? recentObservations.map((observation) => formatObservation(observation))
      : ["- No tool results yet."]),
    "",
    "## Latest Assistant Message",
    "",
    lastAssistantMessage?.content.trim() || finalText || "No assistant message yet.",
  ];

  if (finalText && finalText !== lastAssistantMessage?.content.trim()) {
    sections.push("", "## Final Text", "", finalText);
  }

  return sections.join("\n");
}
