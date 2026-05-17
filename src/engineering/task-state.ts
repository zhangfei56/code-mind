import type { TaskState, TaskStatus } from "../shared/types.js";
import { nowIso } from "../shared/time.js";

const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  created: ["planning", "executing", "cancelled"],
  planning: ["awaiting_approval", "failed", "cancelled"],
  awaiting_approval: ["executing", "cancelled", "needs_user_input"],
  executing: ["verifying", "failed", "needs_user_input"],
  verifying: ["reviewing", "executing", "failed"],
  reviewing: ["completed", "executing", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
  rolled_back: [],
  needs_user_input: ["awaiting_approval", "executing", "cancelled"],
};

export function createTaskState(taskId: string): TaskState {
  return {
    taskId,
    status: "created",
    updatedAt: nowIso(),
  };
}

export function transitionTaskState(
  state: TaskState,
  nextStatus: TaskStatus,
  updates: Partial<Omit<TaskState, "taskId" | "status" | "updatedAt">> = {},
): TaskState {
  if (!ALLOWED_TRANSITIONS[state.status].includes(nextStatus)) {
    throw new Error(`Invalid task state transition: ${state.status} -> ${nextStatus}`);
  }

  return {
    ...state,
    ...updates,
    status: nextStatus,
    updatedAt: nowIso(),
  };
}
