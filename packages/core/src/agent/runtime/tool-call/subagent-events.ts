import type { ToolResult } from "@code-mind/shared";
import { getEffectiveMaxSteps } from "../run-state.js";
import { subagentFinishedEvent, subagentSpawnedEvent } from "../agent-events.js";
import type { ToolCallContext, ToolCallHandlerSlice } from "./types.js";
import {
  readChildSessionId,
  readSubagentName,
  readSubagentTask,
} from "./types.js";

export async function publishSubagentSpawned(
  deps: Pick<ToolCallHandlerSlice, "lifecycle">,
  ctx: ToolCallContext,
  agentName: string,
  task: string,
): Promise<void> {
  await deps.lifecycle.publish(
    ctx.input,
    subagentSpawnedEvent({
      step: ctx.stepNumber,
      maxSteps: getEffectiveMaxSteps(ctx.runState),
      agentName,
      task,
      parentSessionId: ctx.session.id,
      childSessionId: "",
    }),
  );
}

export async function publishSubagentFinished(
  deps: Pick<ToolCallHandlerSlice, "lifecycle">,
  ctx: ToolCallContext,
  agentName: string,
  result: ToolResult,
): Promise<void> {
  const childSessionId = readChildSessionId(result);
  await deps.lifecycle.publish(
    ctx.input,
    subagentFinishedEvent({
      step: ctx.stepNumber,
      maxSteps: getEffectiveMaxSteps(ctx.runState),
      agentName,
      childSessionId,
      success: result.success,
      ...(result.output.trim().length > 0
        ? { summaryPreview: result.output.trim().slice(0, 120) }
        : {}),
    }),
  );
}

export function readSubagentCall(toolCall: ToolCallContext["toolCall"]): {
  isSubagentCall: boolean;
  agentName: string;
  task: string;
} {
  const isSubagentCall = toolCall.name === "run_subagent";
  return {
    isSubagentCall,
    agentName: isSubagentCall ? readSubagentName(toolCall) : "",
    task: isSubagentCall ? readSubagentTask(toolCall) : "",
  };
}
