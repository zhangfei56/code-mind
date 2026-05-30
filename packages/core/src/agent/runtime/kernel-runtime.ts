import type {
  AgentEventInput,
  AgentResult,
  AgentSession,
  RuntimeInput,
} from "@code-mind/shared";
import type {
  RunKernelCommand,
  RunKernelEvent,
  RunKernelPorts,
  RunKernelTransition,
} from "../kernel/index.js";
import {
  primaryRunKernelCommand,
  transitionRunKernelState,
} from "../kernel/index.js";
import type { RunState } from "./run-state.js";
import { kernelTransitionEvent, publish as publishAgentEvent } from "./agent-events.js";

type RunKernelCommandType = RunKernelCommand["type"];
type RunKernelCommandFor<T extends RunKernelCommandType> = Extract<
  RunKernelCommand,
  { type: T }
>;

export type RunKernelCommandHandlers<Result = unknown> = Partial<{
  [Type in RunKernelCommandType]: (
    command: RunKernelCommandFor<Type>,
  ) => Result | Promise<Result>;
}>;

export function isRunKernelCommand<T extends RunKernelCommandType>(
  transition: RunKernelTransition,
  type: T,
): boolean {
  return primaryRunKernelCommand(transition.commands).type === type;
}

export function expectRunKernelCommand<T extends RunKernelCommandType>(
  transition: RunKernelTransition,
  type: T,
): RunKernelCommandFor<T> {
  const command = primaryRunKernelCommand(transition.commands);
  if (command.type !== type) {
    throw new Error(
      `Expected run kernel command ${type} but received ${command.type}.`,
    );
  }
  return command as RunKernelCommandFor<T>;
}

/** Dispatch non-checkpoint kernel commands. Checkpoint persistence is handled separately. */
export async function dispatchRunKernelCommands<Result = unknown>(
  transition: RunKernelTransition,
  handlers: RunKernelCommandHandlers<Result>,
): Promise<Result[]> {
  const results: Result[] = [];
  for (const command of transition.commands) {
    if (command.type === "checkpoint") {
      continue;
    }
    const handler = handlers[command.type] as
      | ((command: RunKernelCommand) => Result | Promise<Result>)
      | undefined;
    if (!handler) {
      throw new Error(`Missing run kernel command handler for ${command.type}.`);
    }
    results.push(await handler(command));
  }
  return results;
}

export const dispatchKernelTransitionCommands = dispatchRunKernelCommands;

export function applyRunKernelEvent(
  runState: RunState,
  event: RunKernelEvent,
): RunKernelTransition {
  const transition = transitionRunKernelState(runState.kernel, event);
  runState.kernel = transition.state;
  return transition;
}

export async function checkpointRunKernel(
  runState: RunState,
  transition: RunKernelTransition,
  checkpointPort: RunKernelPorts["stateStore"],
): Promise<void> {
  if (!transition.commands.some((command) => command.type === "checkpoint")) {
    return;
  }
  const reason =
    transition.commands.find((command) => command.type === "checkpoint")?.reason ??
    "checkpoint";
  await checkpointPort.checkpoint(runState, reason);
}

export type RunKernelCheckpointOptions = {
  input?: RuntimeInput;
  checkpointPort: RunKernelPorts["stateStore"];
};

export function runKernelCheckpointOptions(
  input: RuntimeInput | undefined,
  checkpointPort: RunKernelPorts["stateStore"],
): RunKernelCheckpointOptions {
  return {
    ...(input === undefined ? {} : { input }),
    checkpointPort,
  };
}

export async function applyRunKernelEventAndCheckpoint(
  session: Pick<AgentSession, "id">,
  runState: RunState,
  event: RunKernelEvent,
  options: RunKernelCheckpointOptions,
): Promise<RunKernelTransition> {
  const fromPhase = runState.kernel.phase;
  const transition = applyRunKernelEvent(runState, event);
  await checkpointRunKernel(runState, transition, options.checkpointPort);
  const checkpointReasons = transition.commands
    .filter((command) => command.type === "checkpoint")
    .map((command) => command.reason);
  const tracePayload = {
    eventType: event.type,
    fromPhase,
    toPhase: transition.state.phase,
    step: transition.state.step,
    maxSteps: transition.state.maxSteps,
    closingTurn: transition.state.closingTurn,
    pendingToolCalls: transition.state.pendingToolCalls,
    commands: transition.commands.map((command) => command.type),
    checkpointReasons,
    primaryCommand: primaryRunKernelCommand(transition.commands).type,
  };
  await publishAgentEvent(
    options.input,
    kernelTransitionEvent(tracePayload),
  );
  await options.input?.eventBus?.emitProcessLog(
    "core.run-kernel",
    "Applied run kernel event.",
    {
      sessionId: session.id,
      ...tracePayload,
    },
  );
  return transition;
}
