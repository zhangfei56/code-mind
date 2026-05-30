import type { AgentResult, RuntimeInput } from "@code-mind/shared";
import { setSessionStatus } from "./session-status.js";
import { createLoopPolicy, applyRecommendedMaxSteps } from "../task-strategy.js";
import type { RunState } from "./run-state.js";
import { createRunState, getEffectiveMaxSteps } from "./run-state.js";
import { restoreRunStateForSession } from "./run-state-persistence.js";
import { isRunAbortedError } from "./abortable.js";
import { finalizeResult } from "./finalize.js";
import { completeRun } from "./session-lifecycle.js";
import { initializeSession } from "./session-init.js";
import { runAgentStep, createRunScopedStepRunner } from "./step-runner.js";
import { getEffectiveResultStatus } from "../result-status.js";
import { publish } from "./agent-events.js";
import { createRunScopedKernelPorts } from "./ports/index.js";
import { createRunContext } from "@code-mind/observability";
import type { AgentLoopRuntimeWiring } from "./runtime-wiring.js";

export type { PermissionPrompter } from "./types.js";

export class AgentLoopController {
  private readonly wiring: AgentLoopRuntimeWiring;

  constructor(wiring: AgentLoopRuntimeWiring) {
    this.wiring = wiring;
  }

  async run(input: RuntimeInput): Promise<AgentResult> {
    const workspaceRoot = input.sessionRoot ?? input.task.cwd;
    const task = applyRecommendedMaxSteps(input.task, workspaceRoot);
    const sessionStore = this.wiring.sessionStoreFactory(workspaceRoot);
    const session = input.resumeSessionId
      ? await sessionStore.restoreSession(input.resumeSessionId, input.profile)
      : await sessionStore.create(task, input.profile);

    const runContext = input.eventBus
      ? undefined
      : await createRunContext({
          workspaceRoot,
          sessionId: session.id,
          task: task.text,
          mode: task.mode,
          cwd: task.cwd,
          model: input.model.name,
          surface: task.metadata?.subagent === true ? "subagent" : "cli",
        });

    const eventBus = input.eventBus ?? runContext!.eventBus;
    const unsubscribers: Array<() => void> = [];
    if (input.onEvent) {
      unsubscribers.push(eventBus.subscribe(input.onEvent));
    }

    const normalizedInput: RuntimeInput = { ...input, task, eventBus };
    const runState = input.resumeSessionId
      ? await restoreRunStateForSession(sessionStore, session.id, task)
      : createRunState(task);

    const withRunId = (result: AgentResult): AgentResult => ({
      ...result,
      runId: eventBus.runId,
    });
    const finalize = (result: AgentResult, state: RunState) =>
      withRunId(finalizeResult(result, state));

    const runPorts = createRunScopedKernelPorts({
      staticPorts: this.wiring.staticPorts,
      session,
      model: normalizedInput.model,
      sessionStore,
      input: normalizedInput,
      publish: (eventInput, event) => publish(eventInput, event),
      finalize,
    });

    try {
      await initializeSession(
        this.wiring.sessionInit,
        sessionStore,
        session,
        normalizedInput,
        runState,
      );
      const strategy = createLoopPolicy(session.task);
      const stepRunner = createRunScopedStepRunner({
        runPorts,
        lifecycle: this.wiring.lifecycle,
        resultBuilder: this.wiring.resultBuilder,
        toolRegistry: this.wiring.toolRegistry,
        publish: (eventInput, event) => publish(eventInput, event),
        finalize,
        ...(this.wiring.extensionRegistry === undefined
          ? {}
          : { extensionRegistry: this.wiring.extensionRegistry }),
        ...(this.wiring.subagentManager === undefined
          ? {}
          : { subagentManager: this.wiring.subagentManager }),
      });

      for (let step = 0; step < getEffectiveMaxSteps(runState); step += 1) {
        const early = await runAgentStep(stepRunner, {
          sessionStore,
          session,
          input: normalizedInput,
          runState,
          strategy,
          step,
          stepNumber: step + 1,
        });
        if (early) {
          const result = withRunId(early);
          await completeRun(
            this.wiring.lifecycle,
            sessionStore,
            session,
            result,
            normalizedInput,
            runState,
            { checkpointPort: runPorts.stateStore },
          );
          await eventBus.finish(getEffectiveResultStatus(result));
          await eventBus.flush();
          return result;
        }
        await eventBus.flush();
      }

      const result = finalize(
        this.wiring.resultBuilder.stoppedByLimit(
          session.id,
          normalizedInput.model.name,
          getEffectiveMaxSteps(runState),
        ),
        runState,
      );
      await completeRun(
        this.wiring.lifecycle,
        sessionStore,
        session,
        result,
        normalizedInput,
        runState,
        { checkpointPort: runPorts.stateStore },
      );
      await eventBus.finish(getEffectiveResultStatus(result));
      await eventBus.flush();
      return result;
    } catch (error) {
      if (isRunAbortedError(error) || normalizedInput.abortSignal?.aborted) {
        const result = finalize(
          this.wiring.resultBuilder.cancelled(
            session.id,
            normalizedInput.model.name,
            runState.progress.lastCompletedStep,
          ),
          runState,
        );
        await completeRun(
          this.wiring.lifecycle,
          sessionStore,
          session,
          result,
          normalizedInput,
          runState,
          { checkpointPort: runPorts.stateStore },
        );
        await eventBus.finish(getEffectiveResultStatus(result));
        await eventBus.flush();
        return result;
      }
      const message =
        error instanceof Error ? error.message : "Runtime execution failed.";
      const result = finalize(
        this.wiring.resultBuilder.failed(
          session.id,
          normalizedInput.model.name,
          runState.progress.lastCompletedStep,
          message,
        ),
        runState,
      );
      await completeRun(
        this.wiring.lifecycle,
        sessionStore,
        session,
        result,
        normalizedInput,
        runState,
        { checkpointPort: runPorts.stateStore },
      );
      await eventBus.finish(getEffectiveResultStatus(result));
      await eventBus.flush();
      return result;
    } finally {
      for (const unsub of unsubscribers) {
        unsub();
      }
    }
  }

  static setSessionStatus = setSessionStatus;
}
