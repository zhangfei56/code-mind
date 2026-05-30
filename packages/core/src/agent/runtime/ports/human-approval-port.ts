import type {
  HumanApprovalPort,
  HumanApprovalPortAdapter,
} from "../../kernel/ports.js";
import { resolvePermission } from "../permission.js";
import type { PermissionPrompter } from "../types.js";

export type { HumanApprovalPort, HumanApprovalPortAdapter } from "../../kernel/ports.js";

export function createHumanApprovalPort(params: {
  permissionPrompter?: PermissionPrompter;
}): HumanApprovalPortAdapter {
  return {
    async request({ sessionId, toolCall, reason }) {
      const result = await resolvePermission(
        params.permissionPrompter,
        sessionId,
        toolCall,
        { type: "ask", reason },
        undefined,
        "permission",
      );
      return result.allowed;
    },
    resolve(sessionId, toolCall, decision, callbacks, source, abortSignal) {
      return resolvePermission(
        params.permissionPrompter,
        sessionId,
        toolCall,
        decision,
        callbacks,
        source,
        abortSignal,
      );
    },
  };
}
