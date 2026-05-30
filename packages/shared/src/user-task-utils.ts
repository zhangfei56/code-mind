import type { UserTask } from "./types.js";

export function readRequestedMaxSteps(task: UserTask): number {
  const requested = task.metadata?.requestedMaxSteps;
  return typeof requested === "number" ? requested : task.maxSteps;
}
