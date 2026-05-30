import type { AgentResult, AgentResultStatus } from "./types.js";

/** User-facing outcome; may differ from termination status after finalize. */
export function getEffectiveResultStatus(result: AgentResult): AgentResultStatus {
  return result.effectiveStatus ?? result.status;
}

export function isAgentRunSuccessful(result: AgentResult): boolean {
  return getEffectiveResultStatus(result) === "success";
}
