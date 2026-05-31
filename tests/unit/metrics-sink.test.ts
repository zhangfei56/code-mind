import assert from "node:assert/strict";
import type { AgentEvent } from "@code-mind/shared";
import { MetricsSink } from "@code-mind/observability";

function modelResponseEvent(usage: {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens?: number;
}): AgentEvent {
  return {
    id: "evt_1",
    ts: "2026-05-31T00:00:00.000Z",
    runId: "run_1",
    sessionId: "session_1",
    seq: 1,
    kind: "model.response",
    level: "debug",
    source: { component: "agent.loop", surface: "cli" },
    payload: { usage },
  };
}

export function runMetricsSinkTests(): void {
  const sink = new MetricsSink();
  sink.onEvent(
    modelResponseEvent({
      inputTokens: 100,
      outputTokens: 10,
      totalTokens: 110,
      cachedInputTokens: 80,
    }),
  );
  sink.onEvent(
    modelResponseEvent({
      inputTokens: 50,
      outputTokens: 5,
      totalTokens: 55,
    }),
  );

  const summary = sink.buildSummary("run_1", "session_1", "success");
  assert.equal(summary.modelCalls, 2);
  assert.equal(summary.tokensIn, 150);
  assert.equal(summary.tokensOut, 15);
  assert.equal(summary.totalTokens, 165);
  assert.equal(summary.cachedInputTokens, 80);
}
