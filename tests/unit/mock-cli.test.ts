import assert from "node:assert/strict";
import { executeMockRun, renderMockScenarioList } from "../../apps/cli/src/commands/mock-run.js";
import { listMockScenarios } from "../../apps/cli/src/mock/index.js";

export async function runMockCliTests(): Promise<void> {
  const listed = renderMockScenarioList(listMockScenarios());
  assert.match(listed, /explain-repo/);
  assert.match(listed, /shell-failure/);
  assert.match(listed, /approval/);

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutChunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;

  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderrChunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stderr.write;

  process.env.NO_COLOR = "1";

  try {
    const code = await executeMockRun({
      scenarioId: "explain-repo",
      run: {
        task: "explain this repo",
        cwd: process.cwd(),
        mode: "edit",
        modeExplicit: false,
        maxSteps: 12,
      },
    });
    assert.equal(code, 0);

    const stdout = stdoutChunks.join("");
    const stderr = stderrChunks.join("");
    assert.match(stderr, /Task\n  explain this repo/);
    assert.doesNotMatch(stderr, /Done\n/);
    assert.match(stderr, /✓ 5 steps · success/);
    assert.doesNotMatch(stderr, /Step 1\/12 Inspect project/);
    assert.match(stderr, /list_dir\s+\./);
    assert.match(stderr, /read_file\s+README\.md/);
    assert.match(stderr, /read_file\s+docs\/cli-guide\.md/);
    assert.match(stdout, /code-mind 项目概述/);
    assert.doesNotMatch(stdout, /## code-mind 项目概述/);
    assert.doesNotMatch(stdout, /session_mock/);
  } finally {
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
  }
}
