import type { ApprovalRecord, ToolCall } from "@code-mind/shared";
import { createId, nowIso } from "@code-mind/shared";
import { buildPatchPreview } from "@code-mind/execution";
import { createOrchestrationSessionStore } from "@code-mind/core";

import { alwaysAllowKey, parseApprovalPromptInput } from "./approval-utils.js";

export function formatApprovalRecord(approval: ApprovalRecord): string {
  const lines = [
    `Approval required: ${approval.id}`,
    `Tool: ${approval.toolName}`,
    `Reason: ${approval.reason}`,
    `Arguments: ${JSON.stringify(approval.metadata?.arguments ?? {}, null, 2)}`,
  ];
  const diffPreview = approval.metadata?.diffPreview;
  if (typeof diffPreview === "string" && diffPreview.length > 0) {
    lines.push(`Diff preview:\n${diffPreview}`);
  }
  lines.push("Use /approve, /approve-always, or /deny.");
  return lines.join("\n");
}

interface PendingApproval {
  approval: ApprovalRecord;
  resolve: (result: { approved: boolean; approvalId: string }) => void;
}

export interface ApprovalCoordinatorOptions {
  onApprovalRequested?: (approval: ApprovalRecord, formatted: string) => void;
  emitMessage?: (message: string) => void;
}

export class ApprovalCoordinator {
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private readonly alwaysAllowed = new Set<string>();

  constructor(
    private workspaceRoot: string,
    private readonly options: ApprovalCoordinatorOptions = {},
  ) {}

  private emitMessage(message: string): void {
    if (this.options.emitMessage) {
      this.options.emitMessage(message);
      return;
    }
    console.log(message);
  }

  setWorkspaceRoot(workspaceRoot: string): void {
    this.workspaceRoot = workspaceRoot;
  }

  hasPendingApprovals(): boolean {
    return this.pendingApprovals.size > 0;
  }

  async resolveFromUserInput(line: string, sessionId?: string): Promise<boolean> {
    const choice = parseApprovalPromptInput(line);
    if (choice === undefined) {
      return false;
    }
    if (choice === "explain") {
      this.emitMessage(
        "This action needs explicit approval before the agent can continue in your workspace.",
      );
      return true;
    }
    if (choice === "once") {
      this.emitMessage(await this.approve(undefined, sessionId));
      return true;
    }
    if (choice === "always") {
      this.emitMessage(await this.approveAlways(undefined, sessionId));
      return true;
    }
    this.emitMessage(await this.deny(undefined, sessionId));
    return true;
  }

  async request(
    sessionId: string,
    toolCall: ToolCall,
    reason: string,
    options: {
      onPending?: (approvalId: string) => void | Promise<void>;
    } = {},
  ): Promise<{ approved: boolean; approvalId: string }> {
    const allowKey = alwaysAllowKey(toolCall);
    if (this.alwaysAllowed.has(allowKey)) {
      return { approved: true, approvalId: `always:${allowKey}` };
    }

    const store = createOrchestrationSessionStore(this.workspaceRoot);
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
    await options.onPending?.(approval.id);
    this.options.onApprovalRequested?.(approval, formatApprovalRecord(approval));

    return new Promise((resolve) => {
      this.pendingApprovals.set(approval.id, {
        approval,
        resolve,
      });
    });
  }

  async renderPendingApprovals(sessionId?: string): Promise<string> {
    const pending = sessionId
      ? await createOrchestrationSessionStore(this.workspaceRoot).getPendingApprovals(sessionId)
      : await this.listAllPendingApprovals();
    if (pending.length === 0) {
      return "No pending approvals.";
    }
    return pending
      .map((item) => `${item.id}  ${item.toolName}  ${item.reason}`)
      .join("\n");
  }

  async approve(approvalId?: string, sessionId?: string): Promise<string> {
    const approval = await this.pickPendingApproval(approvalId, sessionId);
    if (!approval) {
      return "No matching pending approval.";
    }
    return this.resolveApproval(approval, true);
  }

  async approveAlways(approvalId?: string, sessionId?: string): Promise<string> {
    const approval = await this.pickPendingApproval(approvalId, sessionId);
    if (!approval) {
      return "No matching pending approval.";
    }
    const toolCall: ToolCall = {
      id: approval.toolCallId,
      name: approval.toolName,
      arguments: (approval.metadata?.arguments ?? {}) as Record<string, unknown>,
    };
    this.alwaysAllowed.add(alwaysAllowKey(toolCall));
    const resolved = await this.resolveApproval(approval, true);
    return `${resolved.replace("Approved", "Always allowed and approved")}`;
  }

  async deny(approvalId?: string, sessionId?: string): Promise<string> {
    const approval = await this.pickPendingApproval(approvalId, sessionId);
    if (!approval) {
      return "No matching pending approval.";
    }
    return this.resolveApproval(approval, false);
  }

  private async resolveApproval(approval: ApprovalRecord, approved: boolean): Promise<string> {
    const store = createOrchestrationSessionStore(this.workspaceRoot);
    await store.saveApproval({
      ...approval,
      status: approved ? "approved" : "denied",
      resolvedAt: nowIso(),
    });
    const pending = this.pendingApprovals.get(approval.id);
    if (pending) {
      this.pendingApprovals.delete(approval.id);
      pending.resolve({
        approved,
        approvalId: approval.id,
      });
    }
    return `${approved ? "Approved" : "Denied"} ${approval.id}.`;
  }

  renderAlwaysAllowed(): string {
    if (this.alwaysAllowed.size === 0) {
      return "No always-allowed rules in this session.";
    }
    return [
      "Always allowed",
      ...[...this.alwaysAllowed].map((item) => `  ${item}`),
    ].join("\n");
  }

  private async listAllPendingApprovals(): Promise<ApprovalRecord[]> {
    const store = createOrchestrationSessionStore(this.workspaceRoot);
    const manifests = await store.listSessionManifests();
    const records = await Promise.all(
      manifests.map((manifest) => store.getPendingApprovals(manifest.id)),
    );
    return records.flat().sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  private async pickPendingApproval(
    approvalId?: string,
    sessionId?: string,
  ): Promise<ApprovalRecord | undefined> {
    if (approvalId) {
      const direct = this.pendingApprovals.get(approvalId)?.approval;
      if (direct) {
        return direct;
      }
      const diskRecords = sessionId
        ? await createOrchestrationSessionStore(this.workspaceRoot).getPendingApprovals(sessionId)
        : await this.listAllPendingApprovals();
      return diskRecords.find((item) => item.id === approvalId);
    }

    if (this.pendingApprovals.size === 1) {
      return [...this.pendingApprovals.values()][0]!.approval;
    }

    const pending = sessionId
      ? await createOrchestrationSessionStore(this.workspaceRoot).getPendingApprovals(sessionId)
      : await this.listAllPendingApprovals();
    if (pending.length !== 1) {
      return undefined;
    }
    return pending[0];
  }
}
