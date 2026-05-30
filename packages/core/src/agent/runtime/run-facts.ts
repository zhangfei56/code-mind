import type { ActivityKind, ToolCall } from "@code-mind/shared";
import { deriveActivityFromTool, nowIso, toolActivityBucket } from "@code-mind/shared";
import type { ProgressState } from "./run-state.js";

export function recordToolActivity(
  progress: ProgressState,
  toolCall: ToolCall,
): ActivityKind {
  const bucket = toolActivityBucket(toolCall.name);
  if (bucket) {
    progress.toolCounts[bucket] += 1;
  }
  progress.lastTool = { name: toolCall.name, at: nowIso() };
  const activity = deriveActivityFromTool(toolCall);
  progress.lastActivity = activity;
  return activity;
}

export function setActivity(progress: ProgressState, activity: ActivityKind): void {
  progress.lastActivity = activity;
}
