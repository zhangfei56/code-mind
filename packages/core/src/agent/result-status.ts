/**
 * Result status conventions:
 *
 * - `result.status`: factual termination reason from the run loop.
 * - `result.effectiveStatus` / getEffectiveResultStatus(): user-facing outcome after finalize.
 *
 * Use isAgentRunSuccessful() or getEffectiveResultStatus() for business branching.
 * Do not compare result.status === "success" for product success checks.
 */
import type { AgentResult } from "@code-mind/shared";
export {
  getEffectiveResultStatus,
  isAgentRunSuccessful,
} from "@code-mind/shared";

export type RejectionSource = "permission" | "hook" | "safety";
export type RejectionKind = "policy_denied" | "user_rejected";

export function attachRejectionMetadata(
  result: AgentResult,
  info: {
    rejectionSource: RejectionSource;
    rejectionKind: RejectionKind;
  },
): AgentResult {
  return {
    ...result,
    metadata: {
      ...result.metadata,
      rejectionSource: info.rejectionSource,
      rejectionKind: info.rejectionKind,
    },
  };
}
