import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AsyncRunManager } from "@code-mind/server-runtime";
import type { RunAgentSessionResult } from "@code-mind/core";

function fakeResult(sessionId: string): RunAgentSessionResult {
  return {
    task: {
      id: "task_1",
      text: "demo",
      cwd: "/tmp",
      mode: "ask",
      maxSteps: 1,
    },
    result: {
      sessionId,
      runId: "run_child",
      status: "success",
      finalText: "done",
      steps: 1,
      modelName: "fake",
    },
  };
}

export async function runAsyncRunManagerTests(): Promise<void> {
  const registryDir = mkdtempSync(join(tmpdir(), "code-mind-async-runs-"));
  const manager = new AsyncRunManager({ registryDir });
  let releaseBlockedRun: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    releaseBlockedRun = resolve;
  });

  const job = manager.start(async ({ abortSignal }) => {
    await blocked;
    if (abortSignal.aborted) {
      throw new Error("Run aborted via API.");
    }
    return fakeResult("session_blocked");
  });

  assert.equal(job.status, "running");

  const aborted = await manager.abort(job.id);
  assert.equal(aborted?.status, "aborted");
  assert.ok(aborted?.finishedAt);

  releaseBlockedRun?.();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const finalJob = await manager.get(job.id);
  assert.equal(finalJob?.status, "aborted");

  const reloaded = new AsyncRunManager({ registryDir });
  const hydrated = await reloaded.get(job.id);
  assert.equal(hydrated?.status, "aborted");
}
