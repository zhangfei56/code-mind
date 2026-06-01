import type { ExtensionRegistry } from "@code-mind/capabilities";
import type {
  AgentResult,
  AgentSession,
  RuntimeInput,
  SkillRunPolicy,
  ToolCall,
  InternalMessage,
} from "@code-mind/shared";
import { createId, nowIso } from "@code-mind/shared";
import type { ToolRegistry } from "@code-mind/execution";
import type { SessionStorePort } from "./ports/session-store-port.js";
import { buildCurrentSummary } from "@code-mind/session";
import type { PromptAssemblyPort, ReviewPort, RunKernelPorts } from "../kernel/ports.js";
import type { RunKernelTransition } from "../kernel/index.js";
import type { ResultBuilder } from "../result-builder.js";
import type { LoopPolicy } from "../task-strategy.js";
import { getEffectiveMaxSteps, addTokenUsage } from "./run-state.js";
import { runHooks, type SessionLifecycleDeps } from "./session-lifecycle.js";
import { setActivity } from "./run-facts.js";
import type { RunState } from "./run-state.js";
import { isRunAbortedError } from "./abortable.js";
import { applyRunKernelEventAndCheckpoint, dispatchKernelTransitionCommands, runKernelCheckpointOptions } from "./kernel-runtime.js";
import { tryReviewRecoveryBeforeCompletion } from "./review-runtime.js";
import type { RuntimeModelPort } from "./ports/model-port.js";
import {
  messageAssistantEvent,
  modelRequestEvent,
  modelResponseEvent,
} from "./agent-events.js";
import { buildStepAssembly, type StepAssembly } from "./model-step-assembly.js";
import { resolveTerminalText } from "./model-step-completion.js";

function estimatePromptTokens(messages: InternalMessage[]): number {
  let chars = 0;
  for (const message of messages) {
    chars += message.content.length;
    if (message.reasoningContent?.length) {
      chars += message.reasoningContent.length;
    }
    if (message.toolCalls?.length) {
      chars += JSON.stringify(message.toolCalls).length;
    }
  }
  return Math.max(1, Math.ceil(chars / 4));
}

export type ModelStepOutcome =
  | { type: "terminal"; result: AgentResult }
  | { type: "tool_calls"; toolCalls: ToolCall[] };

export interface ModelStepDeps {
  getPromptAssembly: () => PromptAssemblyPort;
  getModelPort: (model: RuntimeInput["model"]) => RuntimeModelPort;
  review: ReviewPort;
  extensionRegistry?: ExtensionRegistry;
  skillRunPolicy?: SkillRunPolicy;
  toolRegistry: ToolRegistry;
  lifecycle: SessionLifecycleDeps;
  resultBuilder: ResultBuilder;
  finalize: (result: AgentResult, runState: RunState) => AgentResult;
  setSessionStatus: (
    sessionStore: SessionStorePort,
    sessionId: string,
    status: import("@code-mind/shared").SessionStatus,
    input?: RuntimeInput,
  ) => Promise<void>;
  publish: (
    input: RuntimeInput | undefined,
    event: import("@code-mind/shared").AgentEventInput,
  ) => Promise<void>;
  checkpointPort: RunKernelPorts["stateStore"];
}

export async function executeModelStep(
  deps: ModelStepDeps,
  params: {
    sessionStore: SessionStorePort;
    session: AgentSession;
    input: RuntimeInput;
    runState: RunState;
    strategy: LoopPolicy;
    step: number;
    stepNumber: number;
  },
  stepTransition: RunKernelTransition,
): Promise<ModelStepOutcome> {
  const { sessionStore, session, input, runState, strategy, step, stepNumber } = params;
  const checkpointOptions = runKernelCheckpointOptions(input, deps.checkpointPort);

  let assembly!: StepAssembly;
  await dispatchKernelTransitionCommands(stepTransition, {
    assemble_prompt: async () => {
      assembly = await buildStepAssembly(deps, {
        session,
        input,
        runState,
        strategy,
        stepNumber,
      });
    },
  });

  const {
    messages: summaryMessages,
    enterClosingTurn,
    selectedCapabilities,
    streamContent,
  } = assembly;
  const toolSchemas = selectedCapabilities.toolSchemas;
  const maxSteps = getEffectiveMaxSteps(runState);
  const modelPort = deps.getModelPort(input.model);
  const supportsStreaming = typeof input.model.stream === "function";
  const maxContextTokens = input.model.getCapabilities().maxContextTokens;
  const estimatedContextTokens = estimatePromptTokens(summaryMessages);
  runState.progress.lastMaxContextTokens = maxContextTokens;

  const promptTransition = await applyRunKernelEventAndCheckpoint(
    session,
    runState,
    { type: "prompt_assembled" },
    checkpointOptions,
  );

  let modelResult!: Awaited<ReturnType<RuntimeModelPort["invoke"]>>;
  await dispatchKernelTransitionCommands(promptTransition, {
    call_model: async () => {
      await deps.publish(
        input,
        modelRequestEvent(stepNumber, maxSteps, summaryMessages.length, {
          ...(supportsStreaming ? { streaming: true } : {}),
          ...(streamContent ? { streamContent: true } : {}),
          contextTokens: estimatedContextTokens,
          maxContextTokens,
        }),
      );

      const modelStartedAt = Date.now();
      await input.eventBus?.emitProcessLog("core.model-step", "Dispatching model request.", {
        sessionId: session.id,
        model: input.model.name,
        step: stepNumber,
        messageCount: summaryMessages.length,
        toolSchemaCount: toolSchemas.length,
        selectedCapabilities: {
          skills: selectedCapabilities.skills.map((skill) => skill.name),
          plugins: selectedCapabilities.plugins.map((plugin) => plugin.name),
          auditReasons: selectedCapabilities.auditReasons,
          toolNames: toolSchemas.map((schema) => schema.name),
        },
        enterClosingTurn,
        streaming: supportsStreaming,
        streamContent,
        activity: runState.progress.lastActivity,
      });

      modelResult = await modelPort.invoke(
        {
          messages: summaryMessages,
          tools: toolSchemas,
          ...(input.abortSignal === undefined ? {} : { abortSignal: input.abortSignal }),
          metadata: {
            onRetry: async () => {
              await deps.setSessionStatus(sessionStore, session.id, "retrying", input);
            },
          },
        },
        {
          publish: deps.publish,
          input,
          step: stepNumber,
          streamContent,
        },
      );

      const { response, streamed } = modelResult;

      await deps.setSessionStatus(sessionStore, session.id, "running", input);
      await runHooks(
        deps.lifecycle,
        "AfterModelCall",
        sessionStore,
        session,
        {
          event: "AfterModelCall",
          sessionId: session.id,
          projectPath: session.workspaceRoot,
          mode: session.task.mode,
          modelRequest: {
            messages: summaryMessages,
            tools: deps.toolRegistry.getSchemasForMode(input.task.mode),
          },
          modelResponse: response,
        },
        input,
      );

      await deps.publish(
        input,
        modelResponseEvent({
          step: stepNumber,
          maxSteps,
          finishReason: response.finishReason,
          toolCallCount: response.toolCalls.length,
          durationMs: Date.now() - modelStartedAt,
          maxContextTokens,
          streamed,
          ...(response.text.trim().length === 0
            ? {}
            : { textPreview: response.text.trim().slice(0, 320) }),
          ...(response.reasoningContent?.length
            ? { reasoningLength: response.reasoningContent.length }
            : {}),
          ...(response.toolCalls.length > 0 ? { plannedToolCalls: response.toolCalls } : {}),
          ...(response.usage === undefined ? {} : { usage: response.usage }),
          ...(response.usage?.inputTokens === undefined
            ? {}
            : { contextTokens: response.usage.inputTokens }),
        }),
      );
      if (response.usage?.inputTokens !== undefined) {
        runState.progress.lastContextTokens = response.usage.inputTokens;
      } else if (estimatedContextTokens > 0) {
        runState.progress.lastContextTokens = estimatedContextTokens;
      }
      if (response.usage) {
        addTokenUsage(runState.usage, response.usage);
        await sessionStore.recordModelUsage(session.id, {
          ts: nowIso(),
          ...(input.eventBus?.runId === undefined ? {} : { runId: input.eventBus.runId }),
          step: stepNumber,
          model: input.model.name,
          finishReason: response.finishReason,
          durationMs: Date.now() - modelStartedAt,
          usage: response.usage,
        });
      }
      await input.eventBus?.emitProcessLog("core.model-step", "Received model response.", {
        sessionId: session.id,
        model: input.model.name,
        step: stepNumber,
        finishReason: response.finishReason,
        toolCallCount: response.toolCalls.length,
        textLength: response.text.length,
        usage: response.usage,
        durationMs: Date.now() - modelStartedAt,
      });

      session.messages.push({
        id: createId("msg"),
        role: "assistant",
        content: response.text,
        createdAt: nowIso(),
        ...(response.reasoningContent?.length
          ? { reasoningContent: response.reasoningContent }
          : {}),
        ...(response.toolCalls.length ? { toolCalls: response.toolCalls } : {}),
      });
      await deps.publish(
        input,
        messageAssistantEvent(
          response.text,
          response.toolCalls.length ? response.toolCalls : undefined,
          response.finishReason,
        ),
      );
      await sessionStore.saveCurrentSummary(
        session.id,
        buildCurrentSummary(session, input.model.name, response.text),
      );
    },
  });

  const { response } = modelResult;

  const responseTransition = await applyRunKernelEventAndCheckpoint(
    session,
    runState,
    {
      type: "model_response_received",
      response,
      enterClosingTurn,
    },
    checkpointOptions,
  );

  let outcome!: ModelStepOutcome;
  await dispatchKernelTransitionCommands(responseTransition, {
    complete_from_model: async (completeCommand) => {
      runState.progress.closingTurn = true;
      setActivity(runState.progress, "summarizing");
      const reviewOutcome = await tryReviewRecoveryBeforeCompletion(
        { sessionStore, review: deps.review, publish: deps.publish },
        { session, input, runState, strategy, stepNumber },
      );
      if (reviewOutcome === "retry") {
        runState.progress.closingTurn = false;
        const recoveryTransition = await applyRunKernelEventAndCheckpoint(
          session,
          runState,
          { type: "recovery_requested" },
          checkpointOptions,
        );
        await dispatchKernelTransitionCommands(recoveryTransition, {
          assemble_prompt: async () => {
            setActivity(runState.progress, "editing");
          },
        });
        outcome = { type: "tool_calls", toolCalls: [] };
        return;
      }
      try {
        outcome = {
          type: "terminal",
          result: await resolveTerminalText(deps, {
            session,
            input,
            runState,
            step,
            responseText: completeCommand.responseText,
            forceSummary: completeCommand.forceSummary,
            summaryMessages: [
              ...summaryMessages,
              {
                id: createId("msg"),
                role: "assistant",
                content: response.text,
                createdAt: nowIso(),
              },
            ],
          }),
        };
      } catch (error) {
        if (isRunAbortedError(error) || input.abortSignal?.aborted) {
          outcome = {
            type: "terminal",
            result: deps.finalize(
              deps.resultBuilder.cancelled(session.id, input.model.name, step + 1),
              runState,
            ),
          };
          return;
        }
        throw error;
      }
    },
    handle_tool_calls: async (handleToolsCommand) => {
      outcome = { type: "tool_calls", toolCalls: handleToolsCommand.toolCalls };
    },
  });

  return outcome;
}
