/**
 * Verifies TTY-safe progress output: no \\r / cursor-up redraws during interactive
 * sessions, and approval blocks stay intact after subsequent pane updates.
 */
import assert from "node:assert/strict";
import type { AgentEvent, EventKind } from "@code-mind/shared";
import { ProgressPrinter } from "../apps/cli/src/ui/progress-printer.js";

function mockEvent(kind: EventKind, payload: Record<string, unknown>, seq = 1): AgentEvent {
  return {
    id: `evt_${seq}`,
    ts: new Date().toISOString(),
    runId: "run_verify",
    sessionId: "sess_verify",
    kind,
    level: "info",
    source: { component: "verify", surface: "cli" },
    payload,
  };
}

function assertNoInPlaceTerminalControl(text: string, label: string): void {
  assert.ok(!text.includes("\r"), `${label}: must not use \\r`);
  assert.ok(!/\x1b\[\d+A/.test(text), `${label}: must not use cursor-up`);
  assert.ok(!/\x1b\[2K/.test(text), `${label}: must not clear lines in place`);
}

function createTtyStream(chunks: string[]): NodeJS.WriteStream {
  return {
    isTTY: true,
    columns: 80,
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
  } as NodeJS.WriteStream;
}

async function verifyInteractiveRunApprovalSequence(): Promise<void> {
  const chunks: string[] = [];
  const stream = createTtyStream(chunks);
  const printer = new ProgressPrinter({
    level: 1,
    stream,
    interactiveTerminal: true,
    approvalPromptStyle: "inline",
  });

  await printer.onEvent(mockEvent("turn.started", { modelName: "test", maxSteps: 4 }, 1));
  await printer.onEvent(mockEvent("step.started", { step: 1, maxSteps: 4 }, 2));
  await printer.onEvent(
    mockEvent(
      "model.reasoning.delta",
      { step: 1, delta: "thinking about tests", totalLength: 20 },
      3,
    ),
  );
  await printer.onEvent(
    mockEvent("model.response", {
      step: 1,
      maxSteps: 4,
      toolCallCount: 1,
      textPreview: "Let me run the tests.",
      plannedToolCalls: [{ id: "t1", name: "run_shell", arguments: { command: "pnpm test" } }],
    }, 4),
  );
  await printer.onEvent(
    mockEvent("tool.call", {
      step: 1,
      maxSteps: 4,
      toolCall: { id: "t1", name: "run_shell", arguments: { command: "pnpm test" } },
    }, 5),
  );

  const beforeApproval = chunks.join("");
  assertNoInPlaceTerminalControl(beforeApproval, "before approval");

  await printer.onEvent(
    mockEvent("approval.requested", {
      step: 1,
      maxSteps: 4,
      approvalId: "approval_verify",
      toolCall: { id: "t1", name: "run_shell", arguments: { command: "pnpm test" } },
      reason: "Command requires approval.",
    }, 6),
  );

  const approvalText = chunks.join("");
  assert.match(approvalText, /Approval required/);
  assert.match(approvalText, /Risk/);
  assert.match(approvalText, /Executes a shell command/);
  assert.doesNotMatch(approvalText, /Allow\?/);

  await printer.onEvent(
    mockEvent("approval.resolved", {
      step: 1,
      approved: true,
      approvalId: "approval_verify",
      toolCall: { id: "t1", name: "run_shell", arguments: { command: "pnpm test" } },
    }, 7),
  );
  await printer.onEvent(
    mockEvent("tool.result", {
      step: 1,
      maxSteps: 4,
      success: true,
      exitCode: 0,
      toolCall: { id: "t1", name: "run_shell", arguments: { command: "pnpm test" } },
    }, 8),
  );

  const finalText = chunks.join("");
  assertNoInPlaceTerminalControl(finalText, "after tool.result");
  assert.ok(
    finalText.includes("Executes a shell command"),
    "approval risk text must remain intact after tool.result pane update",
  );
  const approvalStart = finalText.indexOf("Approval required");
  const toolResultPane = finalText.lastIndexOf("│ run_shell");
  assert.ok(approvalStart >= 0 && toolResultPane > approvalStart, "tool.result pane must append after approval block");
}

async function verifyNonInteractiveStillUsesInPlacePreview(): Promise<void> {
  const chunks: string[] = [];
  const stream = createTtyStream(chunks);
  const printer = new ProgressPrinter({ level: 1, stream });
  await printer.onEvent(mockEvent("step.started", { step: 1, maxSteps: 4 }, 10));
  await printer.onEvent(mockEvent("model.request", { step: 1, maxSteps: 4 }, 11));
  await printer.onEvent(
    mockEvent(
      "model.reasoning.delta",
      { step: 1, delta: "pipe mode preview", totalLength: 17 },
      12,
    ),
  );
  await printer.onEvent(
    mockEvent(
      "model.reasoning.delta",
      { step: 1, delta: " updated", totalLength: 25 },
      13,
    ),
  );
  assert.ok(chunks.join("").includes("\r"), "non-interactive TTY may use in-place preview");
}

async function main(): Promise<void> {
  await verifyInteractiveRunApprovalSequence();
  await verifyNonInteractiveStillUsesInPlacePreview();
  console.log("verify-input-safe: all checks passed");
}

main().catch((error: unknown) => {
  console.error("verify-input-safe: FAILED");
  console.error(error);
  process.exit(1);
});
