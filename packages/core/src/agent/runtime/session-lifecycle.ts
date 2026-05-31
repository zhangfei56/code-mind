import type {
  AgentEventInput,
  AgentResult,
  AgentSession,
  CompactionPolicy,
  CompletionKind,
  ModelProvider,
  RuntimeInput,
  SessionStatus,
  TokenUsage,
  HookEvent,
  HookInput,
  HookResult,
} from "@code-mind/shared";
import { DEFAULT_COMPACTION_POLICY, nowIso } from "@code-mind/shared";
import {
  applyCompaction,
  buildCompactionSummarizeInput,
  estimateSessionContextChars,
  hasCompactionEviction,
  shouldCompact,
} from "@code-mind/context";
import type { SessionStorePort } from "./ports/session-store-port.js";
import type { CompactionPort } from "./ports/compaction-port.js";
import { createCompactionPort } from "./ports/compaction-port.js";
import { buildCurrentSummary } from "@code-mind/session";
import type { HookSystem } from "@code-mind/capabilities";
import type { ReviewPort, RunKernelPorts } from "../kernel/ports.js";
import { getEffectiveResultStatus } from "../result-status.js";
import { buildRuntimePlan } from "./plan-artifact.js";
import { runRuntimeReview } from "./review-runtime.js";
import type { RunState } from "./run-state.js";
import { getEffectiveMaxSteps } from "./run-state.js";
import { applyRunKernelEventAndCheckpoint, runKernelCheckpointOptions, type RunKernelCheckpointOptions } from "./kernel-runtime.js";
import {
  contextCompactedEvent,
  contextCompactionFailedEvent,
  hookExecutedEvent,
  runFinishedEvent,
  turnFinishedEvent,
} from "./agent-events.js";

async function saveRuntimeReview(
  sessionStore: SessionStorePort,
  session: AgentSession,
  runState: RunState,
  review: import("../kernel/ports.js").ReviewPort,
): Promise<void> {
  if (
    runState.progress.modifiedFiles.size === 0 ||
    (session.task.mode !== "edit" && session.task.mode !== "agent")
  ) {
    return;
  }

  if (runState.review.lastReview) {
    await sessionStore.saveReview(session.id, runState.review.lastReview);
    return;
  }

  await runRuntimeReview(sessionStore, session, runState, review);
}

export interface SessionLifecycleDeps {
  hookSystem?: HookSystem | undefined;
  review: ReviewPort;
  publish: (input: RuntimeInput | undefined, event: AgentEventInput) => Promise<void>;
  setSessionStatus: (
    sessionStore: SessionStorePort,
    sessionId: string,
    status: SessionStatus,
    input?: RuntimeInput,
    extra?: Partial<{
      model: string;
      completion: CompletionKind;
      effectiveMaxSteps: number;
      modifiedFiles: string[];
    }>,
  ) => Promise<void>;
  compactionPolicy?: CompactionPolicy;
  createCompactionPort?: (model: ModelProvider) => CompactionPort;
}

export async function completeRun(
  deps: SessionLifecycleDeps,
  sessionStore: SessionStorePort,
  session: AgentSession,
  result: AgentResult,
  input?: RuntimeInput,
  runState?: RunState,
  options?: { checkpointPort: RunKernelPorts["stateStore"] },
): Promise<void> {
  const currentSummary = buildCurrentSummary(
    session,
    result.modelName,
    result.finalText,
  );
  await sessionStore.saveCurrentSummary(session.id, currentSummary);
  await sessionStore.saveSummary(session.id, result.summary ?? result.finalText);
  if (
    session.task.mode === "plan" &&
    result.metadata?.completion === "plan_delivered"
  ) {
    const { plan, markdown } = buildRuntimePlan(
      session.task,
      result.finalText,
    );
    await sessionStore.savePlan(session.id, plan, markdown);
  }
  await deps.publish(
    input,
    turnFinishedEvent({
      status: getEffectiveResultStatus(result),
      steps: result.steps,
      finalText: result.finalText,
      mode: session.task.mode,
      completion:
        (result.metadata?.completion as CompletionKind | undefined) ?? "no_progress",
      ...(runState !== undefined
        ? { modifiedFilesCount: runState.progress.modifiedFiles.size }
        : Array.isArray(result.metadata?.modifiedFiles)
          ? { modifiedFilesCount: result.metadata.modifiedFiles.length }
          : {}),
      ...(runState !== undefined && runState.usage.totalTokens > 0
        ? { tokenUsage: { ...runState.usage } }
        : result.metadata?.tokenUsage
          ? { tokenUsage: result.metadata.tokenUsage as TokenUsage }
          : {}),
      ...(runState?.progress.lastContextTokens !== undefined
        ? {
            contextTokens: runState.progress.lastContextTokens,
            ...(runState.progress.lastMaxContextTokens !== undefined
              ? { maxContextTokens: runState.progress.lastMaxContextTokens }
              : {}),
          }
        : {}),
    }),
  );
  await deps.publish(input, runFinishedEvent(getEffectiveResultStatus(result)));
  const latestManifest = await sessionStore.readManifest(session.id);
  await deps.setSessionStatus(
    sessionStore,
    session.id,
    getEffectiveResultStatus(result),
    input,
    {
      model: result.modelName,
      ...(typeof result.metadata?.completion === "string"
        ? { completion: result.metadata.completion as CompletionKind }
        : {}),
      ...(typeof result.metadata?.effectiveMaxSteps === "number"
        ? { effectiveMaxSteps: result.metadata.effectiveMaxSteps }
        : {}),
      ...(Array.isArray(result.metadata?.modifiedFiles)
        ? { modifiedFiles: result.metadata.modifiedFiles as string[] }
        : {}),
      ...(latestManifest.usageSummary === undefined
        ? {}
        : { usageSummary: latestManifest.usageSummary }),
    },
  );
  if (runState) {
    await saveRuntimeReview(sessionStore, session, runState, deps.review);
    const status = getEffectiveResultStatus(result);
    const terminalEvent =
      status === "cancelled"
        ? ({ type: "run_cancelled" } as const)
        : status === "failed"
          ? ({ type: "run_failed" } as const)
          : ({ type: "run_completed" } as const);
    if (!options?.checkpointPort) {
      throw new Error("completeRun requires checkpointPort when runState is provided.");
    }
    await applyRunKernelEventAndCheckpoint(
      session,
      runState,
      terminalEvent,
      runKernelCheckpointOptions(input, options.checkpointPort),
    );
  }
  await runHooks(
    deps,
    "SessionEnd",
    sessionStore,
    session,
    {
      event: "SessionEnd",
      sessionId: session.id,
      projectPath: session.workspaceRoot,
      mode: session.task.mode,
      metadata: {
        status: result.status,
        effectiveStatus: getEffectiveResultStatus(result),
      },
    },
    input,
  );
}

export async function compactSessionIfNeeded(
  deps: SessionLifecycleDeps,
  sessionStore: SessionStorePort,
  session: AgentSession,
  model: ModelProvider,
  input?: RuntimeInput,
  runState?: RunState,
): Promise<void> {
  const policy = deps.compactionPolicy ?? DEFAULT_COMPACTION_POLICY;
  if (!shouldCompact(session, policy)) {
    return;
  }

  const contextChars = estimateSessionContextChars(session);
  if (
    typeof session.metadata?.compactionBlockedContextChars === "number" &&
    session.metadata.compactionBlockedContextChars === contextChars
  ) {
    return;
  }

  const createPort =
    deps.createCompactionPort ??
    ((provider: ModelProvider) => createCompactionPort(provider, policy));
  const compactionPort = createPort(model);
  const summarizeInput = buildCompactionSummarizeInput(session, policy);
  if (!hasCompactionEviction(summarizeInput)) {
    return;
  }

  const step = runState?.progress.lastCompletedStep ?? 0;
  const maxSteps = runState ? getEffectiveMaxSteps(runState) : 0;
  const auditModelName = policy.modelName ?? model.name;

  await deps.setSessionStatus(sessionStore, session.id, "compacting", input);
  const started = Date.now();
  let result;
  try {
    result = await compactionPort.summarize(summarizeInput, {
      ...(input?.abortSignal === undefined ? {} : { abortSignal: input.abortSignal }),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - started;
    session.metadata = {
      ...session.metadata,
      compactionBlockedContextChars: contextChars,
    };
    await deps.publish(
      input,
      contextCompactionFailedEvent({
        step,
        maxSteps,
        contextChars,
        reason,
        modelName: auditModelName,
        evictedMessageCount: summarizeInput.evictedMessages.length,
        evictedObservationCount: summarizeInput.evictedObservations.length,
        durationMs,
      }),
    );
    await input?.eventBus?.emitProcessLog("core.session-lifecycle", "Context compaction failed.", {
      sessionId: session.id,
      reason,
      contextChars,
      durationMs,
    });
    await deps.setSessionStatus(sessionStore, session.id, "running", input);
    return;
  }
  const durationMs = result.durationMs ?? Date.now() - started;
  const compactPath = await sessionStore.saveCompactSummary(
    session.id,
    result.summaryMarkdown,
  );
  applyCompaction(session, result.summaryMarkdown, policy);
  const compactionCount =
    typeof session.metadata?.compactionCount === "number"
      ? session.metadata.compactionCount
      : 1;
  await deps.publish(
    input,
    contextCompactedEvent({
      step,
      maxSteps,
      compactionCount,
      messageCount: session.messages.length,
      evictedMessageCount: summarizeInput.evictedMessages.length,
      evictedObservationCount: summarizeInput.evictedObservations.length,
      path: compactPath,
      strategy: result.strategy,
      ...(result.usage === undefined ? {} : { usage: result.usage }),
      durationMs,
    }),
  );
  await sessionStore.recordCompaction(session.id, {
    ts: nowIso(),
    ...(input?.eventBus?.runId === undefined ? {} : { runId: input.eventBus.runId }),
    step,
    compactionCount,
    strategy: result.strategy,
    retainedMessages: session.messages.length,
    retainedObservations: session.observations.length,
    evictedMessages: summarizeInput.evictedMessages.length,
    evictedObservations: summarizeInput.evictedObservations.length,
    durationMs,
    path: compactPath,
    model: result.modelName,
    ...(result.usage === undefined ? {} : { usage: result.usage }),
  });
  if (result.usage) {
    await sessionStore.recordModelUsage(session.id, {
      ts: nowIso(),
      ...(input?.eventBus?.runId === undefined ? {} : { runId: input.eventBus.runId }),
      step,
      model: result.modelName,
      finishReason: "stop",
      purpose: "compaction",
      durationMs,
      usage: result.usage,
    });
  }
  await sessionStore.saveCurrentSummary(
    session.id,
    buildCurrentSummary(session, model.name),
  );
  await deps.setSessionStatus(sessionStore, session.id, "running", input);
}

export async function runHooks(
  deps: SessionLifecycleDeps,
  event: HookEvent,
  sessionStore: SessionStorePort,
  session: AgentSession,
  hookInput: HookInput,
  publishInput?: RuntimeInput,
): Promise<HookResult[]> {
  if (!deps.hookSystem) {
    return [];
  }
  const results = await deps.hookSystem.run(event, hookInput);
  for (const result of results) {
    await deps.publish(
      publishInput,
      hookExecutedEvent({
        event,
        action: result.action,
        ...(result.action === "deny" || result.action === "ask"
          ? { reason: result.reason }
          : {}),
      }),
    );
  }
  return results;
}
