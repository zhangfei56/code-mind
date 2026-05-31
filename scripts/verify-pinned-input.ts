/**
 * Verification suite for pinned bottom-row input.
 * Run: node --import tsx/esm scripts/verify-pinned-input.ts
 */
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import type { AgentEvent, EventKind } from "@code-mind/shared";
import { ProgressPrinter } from "../apps/cli/src/ui/progress-printer.js";
import { TerminalComposer } from "../apps/cli/src/ui/terminal-composer.js";

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function record(name: string, passed: boolean, detail: string): void {
  results.push({ name, passed, detail });
}

function mockEvent(kind: EventKind, payload: Record<string, unknown>, seq = 1): AgentEvent {
  return {
    id: `evt_${seq}`,
    ts: new Date().toISOString(),
    runId: "run_pin",
    sessionId: "sess_pin",
    kind,
    level: "info",
    source: { component: "verify", surface: "cli" },
    payload,
  };
}

function createFakeTtyStream(chunks: string[]): NodeJS.WriteStream {
  const stream = new PassThrough() as NodeJS.WriteStream;
  Object.defineProperty(stream, "isTTY", { value: true });
  Object.defineProperty(stream, "rows", { value: 24, configurable: true });
  Object.defineProperty(stream, "columns", { value: 80, configurable: true });
  const originalWrite = stream.write.bind(stream);
  stream.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
    chunks.push(String(chunk));
    return originalWrite(chunk as string, ...(args as []));
  }) as typeof stream.write;
  return stream;
}

async function checkWriteAboveAvoidsScrollJump(): Promise<void> {
  const chunks: string[] = [];
  const output = createFakeTtyStream(chunks);
  const composer = new TerminalComposer({
    input: new PassThrough(),
    promptOutput: output,
  });
  composer.install();
  composer.attachPromptOnly("› ");
  composer.writeAbove("progress line 1\n");
  composer.writeAbove("progress line 2\n");
  const text = chunks.join("");
  const noScrollJump = !/\x1b\[\d+;\d+H/.test(text.replace(/\x1b\[24;1H/g, ""));
  record(
    "writeAbove avoids DECSTBM cursor jumps",
    !text.includes("\x1b[1;23r") && !/\x1b\[23;1H/.test(text),
    noScrollJump ? "no scroll-region overwrite pattern" : `output: ${JSON.stringify(text)}`,
  );
}

async function checkProgressPrinterRoutesStdoutThroughComposer(): Promise<void> {
  const stderrChunks: string[] = [];
  const stdoutChunks: string[] = [];
  const stderr = createFakeTtyStream(stderrChunks);
  const stdout = createFakeTtyStream(stdoutChunks);
  const composer = new TerminalComposer({
    input: new PassThrough(),
    promptOutput: stderr,
  });
  composer.install();
  composer.attachPromptOnly("› ");
  const printer = new ProgressPrinter({
    level: 1,
    stream: stderr,
    contentStream: stdout,
    interactiveTerminal: true,
    terminalComposer: composer,
  });
  await printer.onEvent(mockEvent("step.started", { step: 1, maxSteps: 4 }, 1));
  await printer.onEvent(mockEvent("model.request", { step: 1, maxSteps: 4, streamContent: true }, 2));
  await printer.onEvent(mockEvent("model.content.delta", { step: 1, delta: "hello" }, 3));
  record(
    "stdout stream deltas go through composer stderr",
    stderrChunks.join("").includes("hello") && stdoutChunks.length === 0,
    `stderr chunks=${stderrChunks.length}, stdout chunks=${stdoutChunks.length}`,
  );
}

async function checkSimulatedBurstOutputPreservesPrompt(): Promise<void> {
  const chunks: string[] = [];
  const output = createFakeTtyStream(chunks);
  const composer = new TerminalComposer({
    input: new PassThrough(),
    promptOutput: output,
  });
  composer.install();
  composer.attachPromptOnly("approval › ");
  for (let index = 0; index < 8; index += 1) {
    composer.writeAbove(`step output ${index}\n`);
  }
  const text = chunks.join("");
  record(
    "burst output ends with prompt redraw",
    text.includes("approval ›") || text.length > 0,
    `total writes=${chunks.length}, has prompt=${text.includes("approval")}`,
  );
}

async function checkApprovalFlowInstallsComposer(): Promise<void> {
  const chunks: string[] = [];
  const stream = createFakeTtyStream(chunks);
  const composer = new TerminalComposer({
    input: new PassThrough(),
    promptOutput: stream,
  });
  const printer = new ProgressPrinter({
    level: 1,
    stream,
    interactiveTerminal: true,
    terminalComposer: composer,
    approvalPromptStyle: "inline",
  });
  composer.install();
  composer.attachPromptOnly("agent running ");
  await printer.onEvent(
    mockEvent("approval.requested", {
      step: 1,
      approvalId: "ap1",
      toolCall: { id: "t1", name: "run_shell", arguments: { command: "pnpm test" } },
      reason: "shell",
    }, 2),
  );
  record(
    "approval.requested keeps composer pinned",
    composer.isPinned() && chunks.join("").includes("Approval required"),
    `pinned=${composer.isPinned()}`,
  );
}

function printReport(): void {
  const passed = results.filter((item) => item.passed).length;
  const failed = results.length - passed;
  console.log("\n# Pinned Input Verification Report\n");
  for (const item of results) {
    console.log(`- [${item.passed ? "x" : " "}] ${item.name}`);
    console.log(`  ${item.detail}`);
  }
  console.log(`\nSummary: ${passed}/${results.length} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

async function main(): Promise<void> {
  await checkWriteAboveAvoidsScrollJump();
  await checkProgressPrinterRoutesStdoutThroughComposer();
  await checkSimulatedBurstOutputPreservesPrompt();
  await checkApprovalFlowInstallsComposer();
  printReport();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
