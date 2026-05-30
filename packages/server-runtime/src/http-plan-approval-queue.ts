import { nowIso } from "@code-mind/shared";
import type { PlanApprovalRequest } from "./plan-approval.js";

interface PendingPlanApproval extends PlanApprovalRequest {
  createdAt: string;
  resolve: (approved: boolean) => void;
  abortCleanup?: () => void;
}

export class HttpPlanApprovalQueue {
  private readonly pendingBySession = new Map<string, PendingPlanApproval>();

  waitForApproval(
    request: PlanApprovalRequest,
    options: { abortSignal?: AbortSignal } = {},
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const entry: PendingPlanApproval = {
        ...request,
        createdAt: nowIso(),
        resolve,
      };

      if (options.abortSignal) {
        if (options.abortSignal.aborted) {
          resolve(false);
          return;
        }
        const onAbort = (): void => {
          this.cancel(request.planSessionId);
        };
        options.abortSignal.addEventListener("abort", onAbort, { once: true });
        entry.abortCleanup = () => {
          options.abortSignal?.removeEventListener("abort", onAbort);
        };
      }

      this.pendingBySession.set(request.planSessionId, entry);
    });
  }

  getPending(planSessionId: string): Omit<PendingPlanApproval, "resolve" | "abortCleanup"> | undefined {
    const pending = this.pendingBySession.get(planSessionId);
    if (!pending) {
      return undefined;
    }
    const { resolve: _resolve, abortCleanup: _abortCleanup, ...rest } = pending;
    return rest;
  }

  resolve(planSessionId: string, approved: boolean): boolean {
    const pending = this.pendingBySession.get(planSessionId);
    if (!pending) {
      return false;
    }
    this.finishPending(planSessionId, approved);
    return true;
  }

  cancel(planSessionId: string): boolean {
    const pending = this.pendingBySession.get(planSessionId);
    if (!pending) {
      return false;
    }
    this.finishPending(planSessionId, false);
    return true;
  }

  reject(planSessionId: string): boolean {
    return this.cancel(planSessionId);
  }

  hasPending(planSessionId: string): boolean {
    return this.pendingBySession.has(planSessionId);
  }

  listPending(): Array<Omit<PendingPlanApproval, "resolve" | "abortCleanup">> {
    return [...this.pendingBySession.values()].map(
      ({ resolve: _resolve, abortCleanup: _abortCleanup, ...pending }) => pending,
    );
  }

  private finishPending(planSessionId: string, approved: boolean): void {
    const pending = this.pendingBySession.get(planSessionId);
    if (!pending) {
      return;
    }
    pending.abortCleanup?.();
    this.pendingBySession.delete(planSessionId);
    pending.resolve(approved);
  }
}

export const httpPlanApprovalQueue = new HttpPlanApprovalQueue();

export function createHttpPlanApprovalHandler(
  options: { abortSignal?: AbortSignal } = {},
): (request: PlanApprovalRequest) => Promise<boolean> {
  return (request) => httpPlanApprovalQueue.waitForApproval(request, options);
}
