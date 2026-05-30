#!/usr/bin/env node
/**
 * Automated mock UI tests (no real CLI subprocess).
 * For interactive preview use: pnpm mock:cli
 */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { ProgressPrinter } from "../apps/cli/src/ui/progress-printer.js";
import {
  approvalScenario,
  explainRepoScenario,
  getMockScenario,
  shellFailureScenario,
} from "../apps/cli/src/mock/index.js";
import { replayMockScenario } from "../apps/cli/src/mock/replay.js";
import { MOCK_SESSION_ID } from "../apps/cli/src/mock/types.js";

function section(title: string): void {
  process.stdout.write(`\n${"═".repeat(60)}\n  ${title}\n${"═".repeat(60)}\n`);
}

function assertL0(stderr: string, stdout: string): void {
  assert.match(stderr, /Task\n  explain this repo/);
  assert.doesNotMatch(stderr, /Done\n/);
  assert.match(stderr, /✓ 5 steps · success/);
  assert.doesNotMatch(stderr, /Step 1\/12 Inspect project/);
  assert.match(stderr, /list_dir/);
  assert.match(stderr, /read_file.*README/);
  assert.match(stderr, /read_file.*cli-guide/);
  assert.match(stderr, /先读 README/);
  assert.match(stderr, /结论：/);
  assert.doesNotMatch(stderr, /✓ Found package\.json/);
  assert.doesNotMatch(stderr, /model → 1 tool/);
  assert.doesNotMatch(stderr, /tool · list_dir/);
  assert.match(stdout, /code-mind 项目概述/);
  assert.doesNotMatch(stdout, /## code-mind 项目概述/);
  assert.doesNotMatch(stdout, /session_mock/);
}

function assertL2(stderr: string, stdout: string): void {
  assert.match(stderr, /tool → list_dir/);
  assert.match(stderr, /Inspect\n/);
  assert.match(stderr, /compact\s+/);
  assert.match(stdout, /session_mock001/);
}

function assertL3(stderr: string): void {
  assert.match(stderr, /ctx 12\.4k\/128\.0k/);
}

export async function runMockDisplayScenarios(options: { log?: boolean } = {}): Promise<void> {
  const log = options.log ?? false;
  process.env.NO_COLOR = "1";

  const scenario = {
    ...explainRepoScenario,
    taskText: "explain this repo",
    cwd: explainRepoScenario.cwd,
  };

  const show = (title: string, stderr: string, stdout: string): void => {
    if (!log) {
      return;
    }
    section(title);
    if (stderr) {
      process.stderr.write(stderr);
    }
    process.stdout.write(stdout);
  };

  const l0 = await replayMockScenario(scenario, 0, { isTTY: false });
  show("L0 quiet · non-TTY", l0.stderr || "(silent during run)\n", l0.stdout);
  assertL0(l0.stderr, l0.stdout);

  const l0tty = await replayMockScenario(scenario, 0, { isTTY: true });
  show("L0 quiet · TTY", l0tty.stderr, l0tty.stdout);
  assert.doesNotMatch(l0tty.stderr, /Step 2\/12/);

  const l1 = await replayMockScenario(scenario, 1, { isTTY: true });
  show("L1 normal", l1.stderr, l1.stdout);
  assert.match(l1.stdout, /success · 5 steps · deepseek/);

  const l2 = await replayMockScenario(scenario, 2, { isTTY: false });
  show("L2 verbose", l2.stderr, l2.stdout);
  assertL2(l2.stderr, l2.stdout);

  const l3 = await replayMockScenario(scenario, 3, { isTTY: false });
  show("L3 trace", l3.stderr, l3.stdout);
  assertL3(l3.stderr);

  const json = await replayMockScenario(scenario, "json", { isTTY: false });
  if (log) {
    section("JSON mode");
    process.stdout.write(json.stdout);
  }
  const parsed = JSON.parse(json.stdout) as { sessionId: string; status: string };
  assert.equal(parsed.sessionId, MOCK_SESSION_ID);
  assert.equal(json.stderr, "");

  assert.equal(getMockScenario("explain-repo").id, "explain-repo");
  assert.equal(shellFailureScenario.result.status, "failed");
  assert.ok(approvalScenario.events.some((event) => event.kind === "approval.requested"));

  if (log) {
    process.stdout.write("\n✅ All mock display scenarios passed.\n");
  }
}

async function main(): Promise<void> {
  await runMockDisplayScenarios({ log: true });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
