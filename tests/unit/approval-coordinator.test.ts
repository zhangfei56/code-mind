import assert from "node:assert/strict";
import { formatApprovalRecord } from "../../apps/cli/src/interactive/approval-coordinator.js";

export async function runApprovalCoordinatorTests(): Promise<void> {
  const formatted = formatApprovalRecord({
    id: "approval_1",
    sessionId: "session_1",
    toolCallId: "call_1",
    toolName: "apply_patch",
    reason: "Patch requires approval.",
    status: "pending",
    createdAt: new Date().toISOString(),
    metadata: { arguments: { path: "a.txt" } },
  });
  assert.match(formatted, /apply_patch/);
  assert.match(formatted, /Patch requires approval/);
}
