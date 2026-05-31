import type { AgentEvent, AgentResultStatus, TokenUsage } from "@code-mind/shared";
import { addTokenUsage, createEmptyTokenUsage } from "@code-mind/shared";
import type { RunSummary } from "./run-store.js";

export class MetricsSink {
  private steps = 0;
  private modelCalls = 0;
  private toolCalls = 0;
  private readonly usage = createEmptyTokenUsage();
  private startedAt = Date.now();

  onEvent(event: AgentEvent): void {
    switch (event.kind) {
      case "step.finished":
        this.steps += 1;
        break;
      case "model.response":
        this.modelCalls += 1;
        if (event.payload.usage && typeof event.payload.usage === "object") {
          addTokenUsage(this.usage, event.payload.usage as TokenUsage);
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
      tokensIn: this.usage.inputTokens,
      tokensOut: this.usage.outputTokens,
      totalTokens: this.usage.totalTokens,
      ...(this.usage.cachedInputTokens === undefined
        ? {}
        : { cachedInputTokens: this.usage.cachedInputTokens }),
      ...(this.usage.cacheWriteInputTokens === undefined
        ? {}
        : { cacheWriteInputTokens: this.usage.cacheWriteInputTokens }),
      ...(this.usage.uncachedInputTokens === undefined
        ? {}
        : { uncachedInputTokens: this.usage.uncachedInputTokens }),
      wallTimeMs: Date.now() - this.startedAt,
      finishedAt: new Date().toISOString(),
    };
  }
}
