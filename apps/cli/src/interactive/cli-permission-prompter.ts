import type { PermissionPrompter } from "@code-mind/core";
import { createId } from "@code-mind/shared";
import { promptApprovalDecision } from "../ui/prompt.js";
import { alwaysAllowKey } from "./approval-utils.js";

export interface CliPermissionPrompterOptions {
  onBeforePrompt?: () => void;
  onAfterPrompt?: () => void;
}

export class CliPermissionPrompter implements PermissionPrompter {
  private readonly alwaysAllowed = new Set<string>();

  constructor(private readonly options: CliPermissionPrompterOptions = {}) {}

  approve: PermissionPrompter["approve"] = async (
    _sessionId,
    toolCall,
    _decision,
    options,
  ) => {
    const key = alwaysAllowKey(toolCall);
    if (this.alwaysAllowed.has(key)) {
      return { approved: true, approvalId: `always:${key}` };
    }

    const approvalId = createId("approval");
    await options?.onPending?.(approvalId);

    this.options.onBeforePrompt?.();
    try {
      const choice = await promptApprovalDecision();
      if (choice === "always") {
        this.alwaysAllowed.add(key);
        return { approved: true, approvalId };
      }
      if (choice === "once") {
        return { approved: true, approvalId };
      }
      return { approved: false, approvalId };
    } finally {
      this.options.onAfterPrompt?.();
    }
  };
}
