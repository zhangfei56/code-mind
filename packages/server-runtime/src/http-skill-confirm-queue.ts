import { createId, nowIso } from "@code-mind/shared";
import type { SkillConfirmPrompter } from "@code-mind/core";
import { waitWithAbortSignal } from "@code-mind/core";

export interface SkillConfirmRecord {
  id: string;
  sessionId: string;
  skillName: string;
  skillDescription: string;
  score: number;
  reason: string;
  taskText: string;
  status: "pending" | "confirmed" | "declined";
  createdAt: string;
  resolvedAt?: string;
}

interface PendingSkillConfirm {
  record: SkillConfirmRecord;
  resolve: (result: { confirmed: boolean; confirmId: string }) => void;
  abortCleanup?: () => void;
}

export class HttpSkillConfirmQueue {
  private readonly pending = new Map<string, PendingSkillConfirm>();

  createPrompter(options: { abortSignal?: AbortSignal } = {}): SkillConfirmPrompter {
    return {
      confirm: async (request, confirmOptions) => {
        const record: SkillConfirmRecord = {
          id: request.confirmId || createId("skill-confirm"),
          sessionId: request.sessionId,
          skillName: request.skillName,
          skillDescription: request.skillDescription,
          score: request.score,
          reason: request.reason,
          taskText: request.taskText,
          status: "pending",
          createdAt: nowIso(),
        };
        return waitWithAbortSignal(
          new Promise<{ confirmed: boolean; confirmId: string }>((resolve) => {
            const entry: PendingSkillConfirm = { record, resolve };
            if (options.abortSignal) {
              if (options.abortSignal.aborted) {
                resolve({ confirmed: false, confirmId: record.id });
                return;
              }
              const onAbort = (): void => {
                this.resolveConfirm(record.id, false);
              };
              options.abortSignal.addEventListener("abort", onAbort, { once: true });
              entry.abortCleanup = () => {
                options.abortSignal?.removeEventListener("abort", onAbort);
              };
            }
            this.pending.set(record.id, entry);
            void confirmOptions?.onPending?.(record.id);
          }),
          options.abortSignal,
        );
      },
    };
  }

  listPending(sessionId: string): SkillConfirmRecord[] {
    return [...this.pending.values()]
      .filter((entry) => entry.record.sessionId === sessionId)
      .map((entry) => entry.record);
  }

  resolveConfirm(confirmId: string, confirmed: boolean): SkillConfirmRecord | undefined {
    const pending = this.pending.get(confirmId);
    if (!pending) {
      return undefined;
    }
    const resolved: SkillConfirmRecord = {
      ...pending.record,
      status: confirmed ? "confirmed" : "declined",
      resolvedAt: nowIso(),
    };
    pending.abortCleanup?.();
    this.pending.delete(confirmId);
    pending.resolve({ confirmed, confirmId });
    return resolved;
  }

  cancelSessionConfirms(sessionId: string): number {
    let cancelled = 0;
    for (const [confirmId, pending] of this.pending.entries()) {
      if (pending.record.sessionId !== sessionId) {
        continue;
      }
      this.resolveConfirm(confirmId, false);
      cancelled += 1;
    }
    return cancelled;
  }
}

export const httpSkillConfirmQueue = new HttpSkillConfirmQueue();
