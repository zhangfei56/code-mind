import { createId, nowIso } from "@code-mind/shared";
import type { ClarifyPrompter } from "@code-mind/core";
import { waitWithAbortSignal } from "@code-mind/core";

export interface ClarifyRecord {
  id: string;
  sessionId: string;
  question: string;
  taskText: string;
  status: "pending" | "answered" | "skipped";
  createdAt: string;
  resolvedAt?: string;
  answer?: string;
}

interface PendingClarify {
  record: ClarifyRecord;
  resolve: (result: { answer: string; clarifyId: string; skipped?: boolean }) => void;
  abortCleanup?: () => void;
}

export class HttpClarifyQueue {
  private readonly pending = new Map<string, PendingClarify>();

  createPrompter(options: { abortSignal?: AbortSignal } = {}): ClarifyPrompter {
    return {
      clarify: async (request, clarifyOptions) => {
        const record: ClarifyRecord = {
          id: request.clarifyId || createId("clarify"),
          sessionId: request.sessionId,
          question: request.question,
          taskText: request.taskText,
          status: "pending",
          createdAt: nowIso(),
        };
        return waitWithAbortSignal(
          new Promise<{ answer: string; clarifyId: string; skipped?: boolean }>((resolve) => {
            const entry: PendingClarify = { record, resolve };
            if (options.abortSignal) {
              if (options.abortSignal.aborted) {
                resolve({ answer: "", clarifyId: record.id, skipped: true });
                return;
              }
              const onAbort = (): void => {
                this.resolveClarify(record.id, "", true);
              };
              options.abortSignal.addEventListener("abort", onAbort, { once: true });
              entry.abortCleanup = () => {
                options.abortSignal?.removeEventListener("abort", onAbort);
              };
            }
            this.pending.set(record.id, entry);
            void clarifyOptions?.onPending?.(record.id);
          }),
          options.abortSignal,
        );
      },
    };
  }

  listPending(sessionId: string): ClarifyRecord[] {
    return [...this.pending.values()]
      .filter((entry) => entry.record.sessionId === sessionId)
      .map((entry) => entry.record);
  }

  resolveClarify(
    clarifyId: string,
    answer: string,
    skipped = false,
  ): ClarifyRecord | undefined {
    const pending = this.pending.get(clarifyId);
    if (!pending) {
      return undefined;
    }
    const resolved: ClarifyRecord = {
      ...pending.record,
      status: skipped || answer.trim().length === 0 ? "skipped" : "answered",
      answer,
      resolvedAt: nowIso(),
    };
    pending.abortCleanup?.();
    this.pending.delete(clarifyId);
    pending.resolve({
      answer,
      clarifyId,
      skipped: skipped || answer.trim().length === 0,
    });
    return resolved;
  }

  cancelSessionClarifies(sessionId: string): number {
    let cancelled = 0;
    for (const [clarifyId, pending] of this.pending.entries()) {
      if (pending.record.sessionId !== sessionId) {
        continue;
      }
      this.resolveClarify(clarifyId, "", true);
      cancelled += 1;
    }
    return cancelled;
  }
}

export const httpClarifyQueue = new HttpClarifyQueue();
