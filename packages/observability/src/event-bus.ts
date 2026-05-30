import type {
  AgentEvent,
  AgentEventBus,
  AgentEventInput,
  AgentResultStatus,
  RunEmitContext,
} from "@code-mind/shared";
import { buildAgentEvent } from "@code-mind/shared";
import { redactEvent, type RedactionOptions } from "./redaction.js";
import { MetricsSink } from "./metrics-sink.js";
import type { RunManifest, RunStore, RunSummary } from "./run-store.js";

export type EventListener = (event: AgentEvent) => void | Promise<void>;

export interface EventBusOptions {
  ctx: RunEmitContext;
  runStore: RunStore;
  redaction?: RedactionOptions;
}

export class EventBus implements AgentEventBus {
  private seq = 0;
  private readonly listeners = new Set<EventListener>();
  private readonly metrics = new MetricsSink();
  private readonly redaction: RedactionOptions;

  constructor(
    private readonly ctx: RunEmitContext,
    private readonly runStore: RunStore,
    options: { redaction?: RedactionOptions } = {},
  ) {
    this.redaction = options.redaction ?? {};
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async emit(input: AgentEventInput): Promise<AgentEvent> {
    this.seq += 1;
    const event = redactEvent(
      buildAgentEvent(this.ctx, this.seq, input),
      this.redaction,
    );
    await this.runStore.appendEvent(event);
    this.metrics.onEvent(event);
    await this.notify(event);
    return event;
  }

  async emitProcessLog(
    component: string,
    message: string,
    metadata?: Record<string, unknown>,
    level: AgentEvent["level"] = "debug",
  ): Promise<void> {
    await this.emit({
      kind: "process.log",
      level,
      source: { component, surface: this.ctx.source.surface },
      payload: {
        message,
        ...(metadata === undefined ? {} : { metadata }),
      },
    });
  }

  async flush(): Promise<void> {
    await this.runStore.flush();
  }

  async finish(status: AgentResultStatus): Promise<void> {
    const summary = this.metrics.buildSummary(
      this.ctx.runId,
      this.ctx.sessionId,
      status,
    );
    await this.runStore.finish(status, summary);
  }

  get emitContext(): RunEmitContext {
    return this.ctx;
  }

  get runId(): string {
    return this.ctx.runId;
  }

  get sessionId(): string {
    return this.ctx.sessionId;
  }

  private async notify(event: AgentEvent): Promise<void> {
    for (const listener of this.listeners) {
      await listener(event);
    }
  }
}

export function createEventBus(options: EventBusOptions): EventBus {
  return new EventBus(options.ctx, options.runStore, {
    ...(options.redaction === undefined ? {} : { redaction: options.redaction }),
  });
}
