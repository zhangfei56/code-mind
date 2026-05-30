import type { PermissionRequest, ToolCall } from "@code-mind/shared";
import { createId, nowIso } from "@code-mind/shared";
import type { Observation } from "@code-mind/shared";
import { buildCurrentSummary } from "@code-mind/session";
import type { ApprovalFlowCallbacks } from "../../kernel/ports.js";
import { attachRejectionMetadata } from "../../result-status.js";
import { getPermissionMode } from "../plan-mode.js";
import { getEffectiveMaxSteps } from "../run-state.js";
import { setActivity } from "../run-facts.js";
import { applyRunKernelEventAndCheckpoint, runKernelCheckpointOptions } from "../kernel-runtime.js";
import {
  activityUpdatedEvent,
  approvalRequestedEvent,
  approvalResolvedEvent,
  permissionDecisionEvent,
  toolResultEvent,
} from "../agent-events.js";
import type {
  RejectionInfo,
  ToolCallContext,
  ToolCallHandlerSlice,
  ToolCallOutcome,
} from "./types.js";

export function createApprovalCallbacks(
  deps: ToolCallHandlerSlice,
  ctx: Pick<ToolCallContext, "sessionStore" | "session" | "input" | "runState" | "toolCall" | "stepNumber">,
): ApprovalFlowCallbacks {
  const { sessionStore, session, input, runState, toolCall, stepNumber } = ctx;
  const checkpointOptions = runKernelCheckpointOptions(input, deps.checkpointPort);
  return {
    onAwaiting: async ({ reason, source }) => {
      await applyRunKernelEventAndCheckpoint(session, runState, {
        type: "approval_requested",
      }, checkpointOptions);
      await deps.lifecycle.setSessionStatus(
        sessionStore,
        session.id,
        "awaiting_approval",
        input,
      );
      await input.eventBus?.emitProcessLog("core.permission", "Awaiting approval", {
        sessionId: session.id,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        reason,
        source,
      });
    },
    onPending: async ({ approvalId, reason }) => {
      setActivity(runState.progress, "approving");
      await deps.lifecycle.publish(
        input,
        activityUpdatedEvent("approving", undefined, stepNumber),
      );
      await deps.lifecycle.publish(
        input,
        approvalRequestedEvent({
          step: stepNumber,
          maxSteps: getEffectiveMaxSteps(runState),
          toolCall,
          reason,
          ...(approvalId === undefined ? {} : { approvalId }),
        }),
      );
    },
    onResolved: async ({ allowed, approvalId }) => {
      await applyRunKernelEventAndCheckpoint(session, runState, {
        type: "approval_resolved",
        approved: allowed,
      }, checkpointOptions);
      await deps.lifecycle.publish(
        input,
        approvalResolvedEvent({
          step: stepNumber,
          toolCall,
          approved: allowed,
          ...(approvalId === undefined ? {} : { approvalId }),
        }),
      );
      await deps.lifecycle.setSessionStatus(sessionStore, session.id, "running", input);
    },
  };
}

export async function handleRejectedToolCall(
  deps: ToolCallHandlerSlice,
  ctx: ToolCallContext,
  rejection: RejectionInfo,
): Promise<ToolCallOutcome> {
  const { sessionStore, session, input, runState, toolCall, stepNumber, stepIndex } = ctx;
  const observation: Observation = {
    toolCall,
    toolResult: { success: false, output: "", error: rejection.reason },
    createdAt: nowIso(),
  };
  await deps.observation.addObservation(session, observation);
  session.messages.push({
    id: createId("msg"),
    role: "tool",
    content: `ERROR: ${rejection.reason}`,
    createdAt: nowIso(),
    toolCallId: toolCall.id,
    name: toolCall.name,
  });
  await deps.lifecycle.publish(
    input,
    toolResultEvent({
      step: stepNumber,
      maxSteps: getEffectiveMaxSteps(runState),
      toolCall,
      success: false,
      error: rejection.reason,
      output: "",
    }),
  );
  await sessionStore.saveCurrentSummary(
    session.id,
    buildCurrentSummary(session, input.model.name, rejection.reason),
  );
  const baseResult =
    rejection.status === "permission_denied"
      ? deps.resultBuilder.permissionDenied(
          session.id,
          input.model.name,
          stepIndex,
          rejection.reason,
        )
      : deps.resultBuilder.userRejected(
          session.id,
          input.model.name,
          stepIndex,
          rejection.reason,
        );
  const withRejection =
    rejection.source === undefined || rejection.rejectionKind === undefined
      ? baseResult
      : attachRejectionMetadata(baseResult, {
          rejectionSource: rejection.source,
          rejectionKind: rejection.rejectionKind,
        });
  return { type: "done", result: deps.finalize(withRejection, runState) };
}

function resolveSubagentPermissionContext(
  deps: ToolCallHandlerSlice,
  toolCall: ToolCall,
): Pick<PermissionRequest, "subagentTools" | "subagentRole" | "subagentKnown"> {
  if (toolCall.name !== "run_subagent") {
    return {};
  }
  const agentName =
    typeof toolCall.arguments.agentName === "string" ? toolCall.arguments.agentName.trim() : "";
  if (!agentName) {
    return {};
  }
  if (!deps.subagentManager) {
    return {};
  }
  const definition = deps.subagentManager.get(agentName);
  if (!definition) {
    return { subagentKnown: false };
  }
  return {
    subagentKnown: true,
    subagentTools: definition.tools,
    ...(definition.role === undefined ? {} : { subagentRole: definition.role }),
  };
}

export async function authorizeToolCall(
  deps: ToolCallHandlerSlice,
  ctx: ToolCallContext,
): Promise<ToolCallOutcome | undefined> {
  const { sessionStore, session, input, runState, toolCall, stepNumber } = ctx;

  const permissionMode = getPermissionMode(runState);
  const subagentContext = resolveSubagentPermissionContext(deps, toolCall);

  const decision = await deps.permission.check({
    toolCall,
    mode: permissionMode,
    workspaceRoot: session.workspaceRoot,
    isSubagentSession: session.metadata?.subagent === true,
    ...subagentContext,
    ...(runState.planMode.active
      ? {
          planModeActive: true,
          ...(runState.planMode.draftRelativePath === undefined
            ? {}
            : { planDraftRelativePath: runState.planMode.draftRelativePath }),
        }
      : {}),
  } satisfies PermissionRequest);
  await deps.lifecycle.publish(
    input,
    permissionDecisionEvent({
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      decision: decision.type,
      reason:
        "reason" in decision ? String((decision as { reason?: unknown }).reason ?? "") : "",
      step: stepNumber,
    }),
  );

  const approvalCallbacks = createApprovalCallbacks(deps, ctx);
  const approved = await deps.humanApproval.resolve(
    session.id,
    toolCall,
    decision,
    approvalCallbacks,
    "permission",
    input.abortSignal,
  );

  if (!approved.allowed) {
    return handleRejectedToolCall(deps, ctx, approved);
  }

  return undefined;
}
