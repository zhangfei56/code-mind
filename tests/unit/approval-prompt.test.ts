import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalCoordinator } from "../../apps/cli/src/interactive/approval-coordinator.js";
import { parseApprovalPromptInput } from "../../apps/cli/src/interactive/approval-utils.js";
import { renderApprovalBlock } from "../../apps/cli/src/ui/agent-output/blocks.js";

export async function runApprovalPromptTests(): Promise<void> {
  assert.equal(parseApprovalPromptInput("y"), "once");
  assert.equal(parseApprovalPromptInput("always"), "always");
  assert.equal(parseApprovalPromptInput("n"), "deny");
  assert.equal(parseApprovalPromptInput("explain"), "explain");
  assert.equal(parseApprovalPromptInput("find bugs"), undefined);

  const event = {
    id: "evt_1",
    ts: new Date().toISOString(),
    runId: "run_1",
    sessionId: "session_1",
    seq: 1,
    kind: "approval.requested" as const,
    level: "info" as const,
    source: { component: "test", surface: "cli" as const },
    payload: {
      step: 1,
      maxSteps: 10,
      approvalId: "approval_1",
      toolCall: {
        id: "call_1",
        name: "run_shell",
        arguments: { command: "pnpm test" },
      },
      reason: "Command requires approval.",
    },
  };

  assert.match(renderApprovalBlock(event, undefined, "repl").join("\n"), /Reply at prompt/);
  assert.doesNotMatch(renderApprovalBlock(event, undefined, "inline").join("\n"), /Allow\?/);

  const workspace = mkdtempSync(join(tmpdir(), "code-mind-approval-prompt-"));
  const manager = new ApprovalCoordinator(workspace);
  const pendingPromise = manager.request(
    "session_1",
    event.payload.toolCall as import("@code-mind/shared").ToolCall,
    String(event.payload.reason),
  );
  for (let attempt = 0; attempt < 20 && !manager.hasPendingApprovals(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(manager.hasPendingApprovals(), true);
  assert.equal(await manager.resolveFromUserInput("maybe later", "session_1"), false);
  assert.equal(await manager.resolveFromUserInput("y", "session_1"), true);
  assert.equal(manager.hasPendingApprovals(), false);
  const result = await pendingPromise;
  assert.equal(result.approved, true);
}
