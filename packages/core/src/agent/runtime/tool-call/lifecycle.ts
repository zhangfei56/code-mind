import type { ToolResult } from "@code-mind/shared";
import { createId, nowIso } from "@code-mind/shared";
import type { Observation } from "@code-mind/shared";
import { updateExplorationEvidence } from "../exploration-evidence.js";
import { runHooks } from "../session-lifecycle.js";
import { getEffectiveMaxSteps } from "../run-state.js";
import { setActivity } from "../run-facts.js";
import { activityUpdatedEvent, patchAppliedEvent, toolResultEvent } from "../agent-events.js";
import {
  recordToolModifiedFile,
  syncModifiedFilesFromWorkspace,
} from "../change-tracking.js";
import { runAutomaticVerification, runVerifyOnlyAutomaticVerificationIfNeeded, shellLooksLikeVerification } from "../verification.js";
import type { ToolCallHandlerSlice, ToolCallContext, ToolCallOutcome } from "./types.js";
import { buildToolDisplayExtras } from "./types.js";
import {
  createApprovalCallbacks,
  handleRejectedToolCall,
} from "./authorization.js";

const FILE_EDIT_TOOLS = new Set([
  "apply_patch",
  "write_file",
  "search_replace",
  "delete_file",
  "move_file",
]);

function isFileEditTool(toolName: string): boolean {
  return FILE_EDIT_TOOLS.has(toolName);
}

function readPatchArgument(toolCall: ToolCallContext["toolCall"]): string | undefined {
  return typeof toolCall.arguments.patch === "string" ? toolCall.arguments.patch : undefined;
}

function resolvePatchHookPayload(
  toolCall: ToolCallContext["toolCall"],
  result?: ToolResult,
): { patch: string } | Record<string, never> {
  if (result && typeof result.metadata?.diffPreview === "string") {
    return { patch: result.metadata.diffPreview };
  }
  const patch = readPatchArgument(toolCall);
  return patch === undefined ? {} : { patch };
}

export async function runPreExecutionHooks(
  deps: ToolCallHandlerSlice,
  ctx: ToolCallContext,
): Promise<ToolCallOutcome | undefined> {
  const { sessionStore, session, input, toolCall } = ctx;
  const preToolResults = await runHooks(
    deps.lifecycle,
    "PreToolUse",
    sessionStore,
    session,
    {
      event: "PreToolUse",
      sessionId: session.id,
      projectPath: session.workspaceRoot,
      mode: session.task.mode,
      toolCall,
    },
    input,
  );
  const blockingHook = preToolResults.find(
    (item) => item.action === "deny" || item.action === "ask",
  );

  if (blockingHook?.action === "deny") {
    return handleRejectedToolCall(deps, ctx, {
      allowed: false,
      reason: blockingHook.reason,
      status: "permission_denied",
      source: "hook",
      rejectionKind: "policy_denied",
    });
  }

  if (blockingHook?.action === "ask") {
    const approvalCallbacks = createApprovalCallbacks(deps, ctx);
    const hookApproved = await deps.humanApproval.resolve(
      session.id,
      toolCall,
      { type: "ask", reason: blockingHook.reason },
      approvalCallbacks,
      "hook",
      input.abortSignal,
    );
    if (!hookApproved.allowed) {
      return handleRejectedToolCall(deps, ctx, hookApproved);
    }
  }

  return undefined;
}

export async function runToolSpecificPreHooks(
  deps: ToolCallHandlerSlice,
  ctx: Pick<ToolCallContext, "sessionStore" | "session" | "toolCall" | "input">,
): Promise<void> {
  const { sessionStore, session, toolCall, input } = ctx;
  if (isFileEditTool(toolCall.name)) {
    await runHooks(
      deps.lifecycle,
      "BeforePatchApply",
      sessionStore,
      session,
      {
        event: "BeforePatchApply",
        sessionId: session.id,
        projectPath: session.workspaceRoot,
        mode: session.task.mode,
        toolCall,
        ...resolvePatchHookPayload(toolCall),
      },
      input,
    );
  }
  if (toolCall.name === "run_shell") {
    await runHooks(
      deps.lifecycle,
      "BeforeShellRun",
      sessionStore,
      session,
      {
        event: "BeforeShellRun",
        sessionId: session.id,
        projectPath: session.workspaceRoot,
        mode: session.task.mode,
        toolCall,
      },
      input,
    );
  }
}

export async function persistToolResult(
  deps: Pick<ToolCallHandlerSlice, "observation" | "lifecycle">,
  ctx: ToolCallContext,
  result: ToolResult,
  durationMs?: number,
): Promise<void> {
  const { session, input, runState, toolCall, stepNumber } = ctx;

  const observation: Observation = { toolCall, toolResult: result, createdAt: nowIso() };
  await deps.observation.addObservation(session, observation);
  session.messages.push({
    id: createId("msg"),
    role: "tool",
    content: result.success ? result.output : `ERROR: ${result.error ?? result.output}`,
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
      success: result.success,
      ...(result.error === undefined ? {} : { error: result.error }),
      ...(durationMs === undefined ? {} : { durationMs }),
      output: result.output,
      ...buildToolDisplayExtras(result),
    }),
  );

  updateExplorationEvidence(runState.exploration.evidence, toolCall, result);
}

export async function handlePostToolChangeTracking(
  ctx: ToolCallContext,
  result: ToolResult,
): Promise<void> {
  const { session, runState, toolCall } = ctx;
  if (!result.success) {
    return;
  }

  if (isFileEditTool(toolCall.name) && typeof result.metadata?.filePath === "string") {
    recordToolModifiedFile(runState.progress.modifiedFiles, result.metadata.filePath);
  }

  if (isFileEditTool(toolCall.name) || toolCall.name === "run_shell") {
    await syncModifiedFilesFromWorkspace(session.workspaceRoot, runState.progress.modifiedFiles);
  }
}

export async function handlePostPatchVerification(
  deps: ToolCallHandlerSlice,
  ctx: ToolCallContext,
  result: ToolResult,
): Promise<void> {
  const { session, input, runState, strategy, toolCall, stepNumber, sessionStore } = ctx;
  if (
    !isFileEditTool(toolCall.name) ||
    !result.success ||
    typeof result.metadata?.filePath !== "string"
  ) {
    return;
  }

  if (!strategy.autoVerifyAfterPatch) {
    return;
  }

  setActivity(runState.progress, "verifying");
  await deps.lifecycle.publish(
    input,
    activityUpdatedEvent("verifying", undefined, stepNumber),
  );
  await runAutomaticVerification(
    {
      verification: deps.verification,
      publish: (input, event) => deps.lifecycle.publish(input, event),
      checkpointPort: deps.checkpointPort,
    },
    sessionStore,
    session,
    input,
    runState,
    stepNumber,
    strategy,
  );
  if (runState.verification.lastVerification?.passed) {
    setActivity(runState.progress, "summarizing");
  } else {
    setActivity(runState.progress, "editing");
  }
}

export async function runPostExecutionHooks(
  deps: ToolCallHandlerSlice,
  ctx: ToolCallContext,
  result: ToolResult,
): Promise<void> {
  const { sessionStore, session, toolCall } = ctx;

  if (toolCall.name === "run_shell" && result.success) {
    setActivity(ctx.runState.progress, "running");
  }

  await runHooks(
    deps.lifecycle,
    "PostToolUse",
    sessionStore,
    session,
    {
      event: "PostToolUse",
      sessionId: session.id,
      projectPath: session.workspaceRoot,
      mode: session.task.mode,
      toolCall,
      toolResult: result,
    },
    ctx.input,
  );

  if (
    isFileEditTool(toolCall.name) &&
    result.success &&
    typeof result.metadata?.filePath === "string"
  ) {
    await deps.lifecycle.publish(
      ctx.input,
      patchAppliedEvent(result.metadata.filePath, {
        toolCallId: toolCall.id,
      }),
    );
    await runHooks(
      deps.lifecycle,
      "AfterPatchApply",
      sessionStore,
      session,
      {
        event: "AfterPatchApply",
        sessionId: session.id,
        projectPath: session.workspaceRoot,
        mode: session.task.mode,
        toolCall,
        toolResult: result,
        ...resolvePatchHookPayload(toolCall, result),
      },
      ctx.input,
    );
  }

  if (toolCall.name === "run_shell" && result.success) {
    await runHooks(
      deps.lifecycle,
      "AfterShellRun",
      sessionStore,
      session,
      {
        event: "AfterShellRun",
        sessionId: session.id,
        projectPath: session.workspaceRoot,
        mode: session.task.mode,
        toolCall,
        toolResult: result,
      },
      ctx.input,
    );
  }
}

export async function handlePostShellReverification(
  deps: ToolCallHandlerSlice,
  ctx: ToolCallContext,
  result: ToolResult,
): Promise<void> {
  const { session, input, runState, strategy, toolCall, stepNumber, sessionStore } = ctx;
  if (
    toolCall.name !== "run_shell" ||
    !result.success ||
    runState.progress.modifiedFiles.size === 0 ||
    !strategy.autoVerifyAfterPatch ||
    runState.verification.lastVerification?.passed !== false
  ) {
    return;
  }

  setActivity(runState.progress, "verifying");
  await deps.lifecycle.publish(
    input,
    activityUpdatedEvent("verifying", undefined, stepNumber),
  );
  await runAutomaticVerification(
    {
      verification: deps.verification,
      publish: (input, event) => deps.lifecycle.publish(input, event),
      checkpointPort: deps.checkpointPort,
    },
    sessionStore,
    session,
    input,
    runState,
    stepNumber,
    strategy,
  );
  if (runState.verification.lastVerification?.passed) {
    setActivity(runState.progress, "summarizing");
  } else {
    setActivity(runState.progress, "editing");
  }
}

export async function handleVerifyOnlyAutomaticVerification(
  deps: ToolCallHandlerSlice,
  ctx: ToolCallContext,
  result: ToolResult,
): Promise<void> {
  const { session, input, runState, strategy, toolCall, stepNumber, sessionStore } = ctx;
  if (
    toolCall.name !== "run_shell" ||
    !result.success ||
    !shellLooksLikeVerification(toolCall)
  ) {
    return;
  }

  await runVerifyOnlyAutomaticVerificationIfNeeded(
    {
      verification: deps.verification,
      publish: (input, event) => deps.lifecycle.publish(input, event),
      checkpointPort: deps.checkpointPort,
    },
    sessionStore,
    session,
    input,
    runState,
    stepNumber,
    strategy,
  );
}
