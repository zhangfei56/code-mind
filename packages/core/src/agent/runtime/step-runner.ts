import type { ExtensionRegistry, SubagentManager } from "@code-mind/capabilities";
import type { AgentResult, AgentSession, RuntimeInput } from "@code-mind/shared";
import type { ToolRegistry } from "@code-mind/execution";
import type { SessionStorePort } from "./ports/session-store-port.js";
import type { ResultBuilder } from "../result-builder.js";
import type { LoopPolicy } from "../task-strategy.js";
import type { RunKernelPorts } from "../kernel/ports.js";
import type { RuntimeModelPort } from "./ports/model-port.js";
import { executeModelStep, type ModelStepDeps } from "./model-step.js";
import { compactSessionIfNeeded, type SessionLifecycleDeps } from "./session-lifecycle.js";
import type { RunState } from "./run-state.js";
import { getEffectiveMaxSteps } from "./run-state.js";
import { stepStartedEvent } from "./agent-events.js";
import { handleToolCall, type ToolCallHandlerDeps } from "./tool-call-handler.js";
import {
  applyRunKernelEventAndCheckpoint,
  dispatchKernelTransitionCommands,
  runKernelCheckpointOptions,
} from "./kernel-runtime.js";
import { setSessionStatus } from "./session-status.js";

export interface StepRunnerDeps {
  lifecycle: SessionLifecycleDeps;
  modelStep: ModelStepDeps;
  toolHandler: ToolCallHandlerDeps;
  resultBuilder: ResultBuilder;
  finalize: (result: AgentResult, runState: RunState) => AgentResult;
  publish: (
    input: RuntimeInput | undefined,
    event: import("@code-mind/shared").AgentEventInput,
  ) => Promise<void>;
  checkpointPort: RunKernelPorts["stateStore"];
}

export interface CreateRunScopedStepRunnerParams {
  runPorts: RunKernelPorts;
  lifecycle: SessionLifecycleDeps;
  resultBuilder: ResultBuilder;
  toolRegistry: ToolRegistry;
  publish: StepRunnerDeps["publish"];
  finalize: (result: AgentResult, runState: RunState) => AgentResult;
  extensionRegistry?: ExtensionRegistry;
  subagentManager?: SubagentManager;
}

/** Build step runner deps after run-scoped kernel ports exist (Phase B execution). */
export function createRunScopedStepRunner(
  params: CreateRunScopedStepRunnerParams,
): StepRunnerDeps {
  const { runPorts, lifecycle, resultBuilder, toolRegistry, publish, finalize } = params;

  const modelStep: ModelStepDeps = {
    getPromptAssembly: () => runPorts.promptAssembly,
    getModelPort: () => runPorts.model as RuntimeModelPort,
    review: runPorts.review,
    toolRegistry,
    lifecycle,
    resultBuilder,
    finalize,
    setSessionStatus,
    publish,
    checkpointPort: runPorts.stateStore,
    ...(params.extensionRegistry === undefined
      ? {}
      : { extensionRegistry: params.extensionRegistry }),
  };

  const toolHandler: ToolCallHandlerDeps = {
    permission: runPorts.permission,
    humanApproval: runPorts.humanApproval,
    ...(params.subagentManager === undefined
      ? {}
      : { subagentManager: params.subagentManager }),
    tools: runPorts.tools,
    observation: runPorts.observation,
    verification: runPorts.verification,
    review: runPorts.review,
    resultBuilder,
    lifecycle,
    finalize,
    checkpointPort: runPorts.stateStore,
  };

  return {
    lifecycle,
    modelStep,
    toolHandler,
    resultBuilder,
    finalize,
    publish,
    checkpointPort: runPorts.stateStore,
  };
}

export async function runAgentStep(
  deps: StepRunnerDeps,
  params: {
    sessionStore: SessionStorePort;
    session: AgentSession;
    input: RuntimeInput;
    runState: RunState;
    strategy: LoopPolicy;
    step: number;
    stepNumber: number;
  },
): Promise<AgentResult | null> {
  const { sessionStore, session, input, runState, strategy, step, stepNumber } = params;

  const checkpointOptions = runKernelCheckpointOptions(input, deps.checkpointPort);

  runState.progress.lastCompletedStep = stepNumber;
  const stepTransition = await applyRunKernelEventAndCheckpoint(
    session,
    runState,
    {
      type: "step_started",
      step: stepNumber,
      maxSteps: getEffectiveMaxSteps(runState),
      closingTurn: runState.progress.closingTurn,
    },
    checkpointOptions,
  );

  await deps.publish(
    input,
    stepStartedEvent(stepNumber, getEffectiveMaxSteps(runState)),
  );

  if (input.abortSignal?.aborted) {
    return deps.finalize(
      deps.resultBuilder.cancelled(session.id, input.model.name, stepNumber),
      runState,
    );
  }

  const modelOutcome = await executeModelStep(
    deps.modelStep,
    {
      sessionStore,
      session,
      input,
      runState,
      strategy,
      step,
      stepNumber,
    },
    stepTransition,
  );

  if (modelOutcome.type === "terminal") {
    return modelOutcome.result;
  }

  for (const toolCall of modelOutcome.toolCalls) {
    const outcome = await handleToolCall(deps.toolHandler, {
      sessionStore,
      session,
      input,
      runState,
      strategy,
      toolCall,
      stepNumber,
      stepIndex: step + 1,
    });
    if (outcome.type === "done") {
      return outcome.result;
    }
    await compactSessionIfNeeded(
      deps.lifecycle,
      sessionStore,
      session,
      input.model.name,
      input,
      runState,
    );
  }

  if (modelOutcome.toolCalls.length > 0) {
    const transition = await applyRunKernelEventAndCheckpoint(
      session,
      runState,
      { type: "tool_calls_handled" },
      checkpointOptions,
    );
    let stepLimitResult: AgentResult | null = null;
    await dispatchKernelTransitionCommands(transition, {
      finalize: async (command) => {
        if (command.reason === "step_limit") {
          stepLimitResult = deps.finalize(
            deps.resultBuilder.stoppedByLimit(
              session.id,
              input.model.name,
              getEffectiveMaxSteps(runState),
            ),
            runState,
          );
        }
      },
      assemble_prompt: async () => {},
    });
    if (stepLimitResult) {
      return stepLimitResult;
    }
  }

  return null;
}
