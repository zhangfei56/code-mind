import type { PermissionDecision, ToolCall } from "@code-mind/shared";
import type {
  ApprovalFlowCallbacks,
  PermissionResolveResult,
} from "../kernel/ports.js";
import type { PermissionPrompter } from "./types.js";

export type { ApprovalFlowCallbacks, PermissionResolveResult } from "../kernel/ports.js";

export function mergeDecisions(
  baseDecision: PermissionDecision,
  safetyDecision: PermissionDecision,
): PermissionDecision {
  if (baseDecision.type === "deny" || safetyDecision.type === "deny") {
    return baseDecision.type === "deny" ? baseDecision : safetyDecision;
  }
  if (baseDecision.type === "ask" || safetyDecision.type === "ask") {
    return baseDecision.type === "ask" ? baseDecision : safetyDecision;
  }
  return { type: "allow" };
}

import { waitWithAbortSignal } from "./abortable.js";

export async function resolvePermission(
  permissionPrompter: PermissionPrompter | undefined,
  sessionId: string,
  toolCall: ToolCall,
  decision: PermissionDecision,
  callbacks?: ApprovalFlowCallbacks,
  source: "permission" | "hook" = "permission",
  abortSignal?: AbortSignal,
): Promise<PermissionResolveResult> {
  if (decision.type === "allow") {
    return { allowed: true, reason: "" };
  }

  if (decision.type === "deny") {
    return {
      allowed: false,
      reason: decision.reason,
      status: "permission_denied",
      source,
      rejectionKind: "policy_denied" as const,
    };
  }

  if (!permissionPrompter) {
    return {
      allowed: false,
      reason: `${decision.reason} No approval handler is configured for this run.`,
      status: "permission_denied",
      source,
      rejectionKind: "policy_denied" as const,
    };
  }

  await callbacks?.onAwaiting?.({ reason: decision.reason, source });

  const approval = await waitWithAbortSignal(
    permissionPrompter.approve(sessionId, toolCall, decision, {
      onPending: async (approvalId) => {
        await callbacks?.onPending?.({
          approvalId,
          reason: decision.reason,
          source,
        });
      },
    }),
    abortSignal,
  );

  const resolved = approval.approved
    ? {
        allowed: true as const,
        reason: "",
        ...(approval.approvalId === undefined ? {} : { approvalId: approval.approvalId }),
      }
    : {
        allowed: false as const,
        reason: "User rejected this tool call.",
        status: "user_rejected" as const,
        source,
        rejectionKind: "user_rejected" as const,
        ...(approval.approvalId === undefined ? {} : { approvalId: approval.approvalId }),
      };

  await callbacks?.onResolved?.({
    allowed: resolved.allowed,
    reason: resolved.reason,
    source,
    ...(resolved.approvalId === undefined ? {} : { approvalId: resolved.approvalId }),
  });

  return resolved;
}
