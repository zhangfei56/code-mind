import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventBus, RunStore } from "@code-mind/observability";

export async function runObservabilityTests(): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), "code-mind-obs-"));
  const runStore = await RunStore.create(workspace, {
    runId: "run_test_001",
    sessionId: "session_test_001",
    task: "test",
    mode: "ask",
    cwd: workspace,
    model: "mock",
    startedAt: new Date().toISOString(),
  });
  const bus = new EventBus(
    {
      runId: "run_test_001",
      sessionId: "session_test_001",
      source: { component: "test", surface: "system" },
    },
    runStore,
  );

  await bus.emit({
    kind: "tool.result",
    payload: { toolName: "read_file", success: true },
  });
  await bus.flush();

  const eventsPath = join(workspace, ".agent", "runs", "run_test_001", "events.jsonl");
  const content = await readFile(eventsPath, "utf8");
  assert.match(content, /tool\.result/);
  assert.match(content, /read_file/);
}
