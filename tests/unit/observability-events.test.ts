import assert from "node:assert/strict";
import { buildAgentEvent, defaultLevelForKind } from "@code-mind/observability";

export function runObservabilityEventTests(): void {
  assert.equal(defaultLevelForKind("tool.result"), "debug");
  assert.equal(defaultLevelForKind("approval.requested"), "info");

  const ctx = {
    runId: "run_1",
    sessionId: "session_1",
    source: { component: "test", surface: "cli" as const },
  };
  const event = buildAgentEvent(ctx, 1, {
    kind: "session.started",
    payload: { task: "hello" },
  });

  assert.equal(event.kind, "session.started");
  assert.equal(event.level, "info");
  assert.equal(event.runId, "run_1");
  assert.equal(event.payload.task, "hello");
}
