import type { AgentEvent } from "@code-mind/shared";
import { readRunEvents } from "@code-mind/observability";

export type RuntimeEventListener = (event: AgentEvent) => void;

export interface RuntimeEventSubscribeOptions {
  replay?: {
    workspaceRoot: string;
    runId: string;
  };
}

/** In-process pub/sub for run/session channels; WebSocket bridges via API layer. */
export class RuntimeEventHub {
  private readonly listeners = new Map<string, Set<RuntimeEventListener>>();

  subscribe(
    channel: string,
    listener: RuntimeEventListener,
    options: RuntimeEventSubscribeOptions = {},
  ): () => void {
    const bucket = this.listeners.get(channel) ?? new Set<RuntimeEventListener>();
    bucket.add(listener);
    this.listeners.set(channel, bucket);

    if (options.replay) {
      void this.replayRunEvents(options.replay.workspaceRoot, options.replay.runId, listener);
    }

    return () => {
      bucket.delete(listener);
      if (bucket.size === 0) {
        this.listeners.delete(channel);
      }
    };
  }

  async replayRunEvents(
    workspaceRoot: string,
    runId: string,
    listener: RuntimeEventListener,
  ): Promise<void> {
    const events = await readRunEvents(workspaceRoot, runId);
    for (const event of events) {
      listener(event as AgentEvent);
    }
  }

  publish(channel: string, event: AgentEvent): void {
    const bucket = this.listeners.get(channel);
    if (!bucket) {
      return;
    }
    for (const listener of bucket) {
      listener(event);
    }
  }

  publishRunEvent(runId: string | undefined, event: AgentEvent): void {
    if (runId) {
      this.publish(runId, event);
    }
    this.publish(`session:${event.sessionId}`, event);
  }
}

export function createRunEventPublisher(runId?: string) {
  return async (event: AgentEvent): Promise<void> => {
    runtimeEventHub.publishRunEvent(runId, event);
  };
}

export const runtimeEventHub = new RuntimeEventHub();
