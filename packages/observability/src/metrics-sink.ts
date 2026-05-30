import type { AgentEvent, AgentResultStatus } from "@code-mind/shared";
import type { RunSummary } from "./run-store.js";

export class MetricsSink {
  private steps = 0;
  private modelCalls = 0;
  private toolCalls = 0;
  private tokensIn = 0;
  private tokensOut = 0;
  private startedAt = Date.now();

  onEvent(event: AgentEvent): void {
    switch (event.kind) {
      case "step.finished":
        this.steps += 1;
        break;
      case "model.response":
        this.modelCalls += 1;
        if (typeof event.payload.tokensIn === "number") {
          this.tokensIn += event.payload.tokensIn;
        }
        if (typeof event.payload.tokensOut === "number") {
          this.tokensOut += event.payload.tokensOut;
        }
        break;
      case "tool.result":
        this.toolCalls += 1;
        break;
      default:
        break;
    }
  }

  buildSummary(runId: string, sessionId: string, status: AgentResultStatus): RunSummary {
    return {
      runId,
      sessionId,
      status,
      steps: this.steps,
      modelCalls: this.modelCalls,
      toolCalls: this.toolCalls,
      tokensIn: this.tokensIn,
      tokensOut: this.tokensOut,
      wallTimeMs: Date.now() - this.startedAt,
      finishedAt: new Date().toISOString(),
    };
  }
}
