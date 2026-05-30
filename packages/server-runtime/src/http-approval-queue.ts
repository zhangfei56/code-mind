import { buildPatchPreview } from "@code-mind/execution";
import { createId, nowIso } from "@code-mind/shared";
import type { ApprovalRecord, ToolCall } from "@code-mind/shared";
import type { PermissionPrompter, SessionStorePort } from "@code-mind/core";
import { waitWithAbortSignal } from "@code-mind/core";

interface PendingApproval {
  approval: ApprovalRecord;
  resolve: (result: { approved: boolean; approvalId: string }) => void;
  abortCleanup?: () => void;
}

export class HttpApprovalQueue {
  private readonly pending = new Map<string, PendingApproval>();

  createPrompter(
    sessionStoreFactory: (workspaceRoot: string) => SessionStorePort,
    workspaceRoot: string,
    options: { abortSignal?: AbortSignal } = {},
  ): PermissionPrompter {
    return {
      approve: async (sessionId, toolCall, decision, approveOptions) => {
        const store = sessionStoreFactory(workspaceRoot);
        const approval = await this.enqueueApproval(
          store,
          sessionId,
          toolCall,
          decision.reason,
        );
        await approveOptions?.onPending?.(approval.id);
        return waitWithAbortSignal(
          new Promise<{ approved: boolean; approvalId: string }>((resolve) => {
            const entry: PendingApproval = { approval, resolve };
            if (options.abortSignal) {
              if (options.abortSignal.aborted) {
                resolve({ approved: false, approvalId: approval.id });
                return;
              }
              const onAbort = (): void => {
                this.cancelApproval(approval.id, false);
              };
              options.abortSignal.addEventListener("abort", onAbort, { once: true });
              entry.abortCleanup = () => {
                options.abortSignal?.removeEventListener("abort", onAbort);
              };
            }
            this.pending.set(approval.id, entry);
          }),
          options.abortSignal,
        );
      },
    };
  }

  async enqueueApproval(
    store: SessionStorePort,
    sessionId: string,
    toolCall: ToolCall,
    reason: string,
  ): Promise<ApprovalRecord> {
    const approval: ApprovalRecord = {
      id: createId("approval"),
      sessionId,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      reason,
      status: "pending",
      createdAt: nowIso(),
      metadata: {
        arguments: toolCall.arguments,
        ...(toolCall.name === "apply_patch" &&
        typeof toolCall.arguments.patch === "string"
          ? { diffPreview: buildPatchPreview(toolCall.arguments.patch) }
          : {}),
      },
    };
    await store.saveApproval(approval);
    return approval;
  }

  resolveApproval(
    store: SessionStorePort,
    approvalId: string,
    approved: boolean,
  ): ApprovalRecord | undefined {
    const pending = this.pending.get(approvalId);
    if (!pending) {
      return undefined;
    }
    const resolved: ApprovalRecord = {
      ...pending.approval,
      status: approved ? "approved" : "denied",
      resolvedAt: nowIso(),
    };
    void store.saveApproval(resolved);
    this.finishPending(approvalId, approved);
    return resolved;
  }

  cancelApproval(approvalId: string, approved = false): boolean {
    if (!this.pending.has(approvalId)) {
      return false;
    }
    this.finishPending(approvalId, approved);
    return true;
  }

  cancelSessionApprovals(sessionId: string, approved = false): number {
    let cancelled = 0;
    for (const [approvalId, pending] of this.pending.entries()) {
      if (pending.approval.sessionId !== sessionId) {
        continue;
      }
      this.finishPending(approvalId, approved);
      cancelled += 1;
    }
    return cancelled;
  }

  hasPending(approvalId: string): boolean {
    return this.pending.has(approvalId);
  }

  private finishPending(approvalId: string, approved: boolean): void {
    const pending = this.pending.get(approvalId);
    if (!pending) {
      return;
    }
    pending.abortCleanup?.();
    this.pending.delete(approvalId);
    pending.resolve({
      approved,
      approvalId,
    });
  }
}

export const httpApprovalQueue = new HttpApprovalQueue();
