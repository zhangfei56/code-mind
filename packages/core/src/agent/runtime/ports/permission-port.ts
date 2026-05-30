import type { PermissionDecision, PermissionRequest } from "@code-mind/shared";
import type { PermissionEngine, SafetyGuard } from "@code-mind/security";
import type { PermissionPort } from "../../kernel/ports.js";
import { mergeDecisions } from "../permission.js";

export function createPermissionPort(params: {
  permissionEngine: PermissionEngine;
  safetyGuard: SafetyGuard;
}): PermissionPort {
  return {
    async check(request: PermissionRequest): Promise<PermissionDecision> {
      const decision = await params.permissionEngine.check(request);
      const safetyDecision = await params.safetyGuard.check({
        toolCall: request.toolCall,
        mode: request.mode,
        workspaceRoot: request.workspaceRoot,
      });
      return mergeDecisions(decision, safetyDecision);
    },
  };
}
