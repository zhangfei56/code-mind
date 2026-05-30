import { createId, nowIso } from "@code-mind/shared";
import { activityDetailFromTool } from "@code-mind/shared";
import { buildCurrentSummary } from "@code-mind/session";
import { isRunAbortedError } from "./abortable.js";
import {
  getPermissionMode,
  handleEnterPlanMode,
  handleExitPlanMode,
  isPlanModeTool,
  readPlanTextArg,
} from "./plan-mode.js";
import { recordToolActivity } from "./run-facts.js";
import { getEffectiveMaxSteps } from "./run-state.js";
import { activityUpdatedEvent, toolCallEvent } from "./agent-events.js";
import { createToolContext } from "./types.js";
import { authorizeToolCall } from "./tool-call/authorization.js";
import {
  handlePostPatchVerification,
  handlePostShellReverification,
  handlePostToolChangeTracking,
  persistToolResult,
  runPostExecutionHooks,
  runPreExecutionHooks,
  runToolSpecificPreHooks,
} from "./tool-call/lifecycle.js";
import {
  publishSubagentFinished,
  publishSubagentSpawned,
  readSubagentCall,
} from "./tool-call/subagent-events.js";
import type {
  ToolCallContext,
  ToolCallHandlerDeps,
  ToolCallOutcome,
} from "./tool-call/types.js";

export type { ToolCallHandlerDeps, ToolCallOutcome } from "./tool-call/types.js";

async function beginToolCall(
  deps: ToolCallHandlerDeps,
  ctx: ToolCallContext,
): Promise<void> {
  const { sessionStore, session, input, runState, toolCall, stepNumber } = ctx;
  const activity = recordToolActivity(runState.progress, toolCall);
  const detail = activityDetailFromTool(toolCall);
  await deps.lifecycle.publish(
    input,
    activityUpdatedEvent(activity, detail, stepNumber),
  );
  await deps.lifecycle.publish(
    input,
    toolCallEvent(stepNumber, getEffectiveMaxSteps(runState), toolCall),
  );
}

export async function handleToolCall(
  deps: ToolCallHandlerDeps,
  params: ToolCallContext,
): Promise<ToolCallOutcome> {
  const ctx = params;

  try {
    await beginToolCall(deps, ctx);

    if (isPlanModeTool(ctx.toolCall.name)) {
      const planResult =
        ctx.toolCall.name === "enter_plan_mode"
          ? await handleEnterPlanMode(
              { lifecycle: deps.lifecycle, sessionStore: ctx.sessionStore },
              { session: ctx.session, input: ctx.input, runState: ctx.runState },
            )
          : await handleExitPlanMode(
              { lifecycle: deps.lifecycle, sessionStore: ctx.sessionStore },
              {
                session: ctx.session,
                input: ctx.input,
                runState: ctx.runState,
                toolCall: ctx.toolCall,
                planText: readPlanTextArg(ctx.toolCall),
              },
            );
      await persistToolResult(deps, ctx, planResult, 0);
      if (planResult.success && ctx.toolCall.name === "exit_plan_mode") {
        ctx.session.messages.push({
          id: createId("msg"),
          role: "user",
          content: planResult.output,
          createdAt: nowIso(),
        });
      }
      await ctx.sessionStore.saveCurrentSummary(
        ctx.session.id,
        buildCurrentSummary(ctx.session, ctx.input.model.name),
      );
      return { type: "continue" };
    }

    const authRejected = await authorizeToolCall(deps, ctx);
    if (authRejected) {
      return authRejected;
    }

    const hookRejected = await runPreExecutionHooks(deps, ctx);
    if (hookRejected) {
      return hookRejected;
    }

    await runToolSpecificPreHooks(deps, ctx);

    const toolStartedAt = Date.now();
    const { isSubagentCall, agentName, task: subagentTask } = readSubagentCall(ctx.toolCall);

    if (isSubagentCall && agentName) {
      await publishSubagentSpawned(deps, ctx, agentName, subagentTask);
    }

    const result = await deps.tools.execute(
      ctx.toolCall,
      createToolContext(ctx.session, ctx.input.abortSignal, getPermissionMode(ctx.runState)),
    );

    if (isSubagentCall && agentName) {
      await publishSubagentFinished(deps, ctx, agentName, result);
    }

    await persistToolResult(deps, ctx, result, Date.now() - toolStartedAt);
    await handlePostToolChangeTracking(ctx, result);
    await handlePostPatchVerification(deps, ctx, result);
    await handlePostShellReverification(deps, ctx, result);
    await runPostExecutionHooks(deps, ctx, result);

    await ctx.sessionStore.saveCurrentSummary(
      ctx.session.id,
      buildCurrentSummary(ctx.session, ctx.input.model.name),
    );

    return { type: "continue" };
  } catch (error) {
    if (isRunAbortedError(error) || ctx.input.abortSignal?.aborted) {
      return {
        type: "done",
        result: deps.finalize(
          deps.resultBuilder.cancelled(
            ctx.session.id,
            ctx.input.model.name,
            ctx.stepIndex,
          ),
          ctx.runState,
        ),
      };
    }
    throw error;
  }
}
