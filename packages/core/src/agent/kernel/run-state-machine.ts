import type { RunKernelCommand } from "./commands.js";
import type { RunKernelEvent } from "./events.js";
import { assertRunKernelInvariants } from "./invariants.js";
import {
  createRunKernelState,
  type RunKernelPhase,
  type RunKernelState,
} from "./state.js";

export interface RunKernelTransition {
  state: RunKernelState;
  commands: RunKernelCommand[];
}

export function primaryRunKernelCommand(commands: RunKernelCommand[]): RunKernelCommand {
  const command = commands.find((item) => item.type !== "checkpoint") ?? commands[0];
  if (!command) {
    throw new Error("Run kernel transition produced no command.");
  }
  return command;
}

function isTerminalPhase(state: RunKernelState): boolean {
  return state.phase === "completed" || state.phase === "cancelled" || state.phase === "failed";
}

function isTerminalEvent(event: RunKernelEvent): boolean {
  return event.type === "run_completed" || event.type === "run_cancelled" || event.type === "run_failed";
}

export function canAcceptToolCallsHandled(phase: RunKernelPhase): boolean {
  return phase === "handling_tools" || phase === "executing_tool";
}

function eventAllowedPhases(event: RunKernelEvent): readonly RunKernelPhase[] | undefined {
  switch (event.type) {
    case "run_started":
      return ["initializing"];
    case "step_started":
      return [
        "initializing",
        "assembling_prompt",
        "recovering",
        "finalizing",
      ];
    case "prompt_assembled":
      return ["assembling_prompt", "recovering"];
    case "model_response_received":
      return ["calling_model", "routing_model_response"];
    case "tool_calls_handled":
      return ["handling_tools", "executing_tool"];
    case "approval_requested":
      return ["handling_tools", "executing_tool"];
    case "approval_resolved":
      return ["awaiting_approval"];
    case "recovery_requested":
      return ["finalizing", "executing_tool", "handling_tools"];
    case "verification_started":
      return ["executing_tool", "handling_tools"];
    case "verification_finished":
      return ["verifying"];
    case "run_completed":
    case "run_cancelled":
    case "run_failed":
      return undefined;
  }
}

function assertEventAllowed(state: RunKernelState, event: RunKernelEvent): void {
  const allowed = eventAllowedPhases(event);
  if (!allowed || allowed.includes(state.phase)) {
    return;
  }
  throw new Error(`Run kernel invariant failed: phase ${state.phase} cannot receive ${event.type}.`);
}

export function transitionRunKernelState(
  state: RunKernelState,
  event: RunKernelEvent,
): RunKernelTransition {
  if (isTerminalPhase(state) && !isTerminalEvent(event)) {
    throw new Error(`Run kernel invariant failed: terminal phase cannot receive ${event.type}.`);
  }
  assertEventAllowed(state, event);

  let nextState = state;
  let commands: RunKernelCommand[];

  switch (event.type) {
    case "run_started":
      nextState = createRunKernelState({
        maxSteps: event.maxSteps,
        phase: "assembling_prompt",
      });
      commands = [
        { type: "checkpoint", reason: "step_start" },
        { type: "assemble_prompt" },
      ];
      break;
    case "step_started":
      nextState = {
        ...state,
        phase: "assembling_prompt",
        step: event.step,
        maxSteps: event.maxSteps,
        closingTurn: event.closingTurn,
        checkpointRequired: true,
      };
      commands = [
        { type: "checkpoint", reason: "step_start" },
        { type: "assemble_prompt" },
      ];
      break;
    case "prompt_assembled":
      nextState = {
        ...state,
        phase: "calling_model",
        checkpointRequired: true,
      };
      commands = [
        { type: "checkpoint", reason: "prompt_assembled" },
        { type: "call_model" },
      ];
      break;
    case "model_response_received":
      if (event.response.toolCalls.length > 0) {
        nextState = {
          ...state,
          phase: "handling_tools",
          pendingToolCalls: event.response.toolCalls.length,
          checkpointRequired: true,
        };
        commands = [
          { type: "checkpoint", reason: "model_response" },
          {
            type: "handle_tool_calls",
            toolCalls: event.response.toolCalls,
          },
        ];
        break;
      }
      nextState = {
        ...state,
        phase: "finalizing",
        closingTurn: true,
        pendingToolCalls: 0,
        checkpointRequired: true,
      };
      commands = [
        { type: "checkpoint", reason: "model_response" },
        {
          type: "complete_from_model",
          responseText: event.response.text,
          forceSummary: event.enterClosingTurn,
        },
      ];
      break;
    case "tool_calls_handled":
      nextState = {
        ...state,
        phase: state.step >= state.maxSteps ? "finalizing" : "assembling_prompt",
        pendingToolCalls: 0,
        checkpointRequired: true,
      };
      commands =
        state.step >= state.maxSteps
          ? [
              { type: "checkpoint", reason: "tool_result" },
              { type: "finalize", reason: "step_limit" },
            ]
          : [
              { type: "checkpoint", reason: "tool_result" },
              { type: "assemble_prompt" },
            ];
      break;
    case "approval_requested":
      nextState = {
        ...state,
        phase: "awaiting_approval",
        checkpointRequired: true,
      };
      commands = [{ type: "checkpoint", reason: "approval_interrupt" }];
      break;
    case "approval_resolved":
      nextState = {
        ...state,
        phase: event.approved ? "executing_tool" : "recovering",
        pendingToolCalls: event.approved ? state.pendingToolCalls : 0,
        checkpointRequired: true,
      };
      commands = [{ type: "checkpoint", reason: "tool_result" }];
      break;
    case "recovery_requested":
      nextState = {
        ...state,
        phase: "recovering",
        closingTurn: false,
        pendingToolCalls: 0,
        checkpointRequired: true,
      };
      commands = [
        { type: "checkpoint", reason: "recovery" },
        { type: "assemble_prompt" },
      ];
      break;
    case "verification_started":
      nextState = {
        ...state,
        phase: "verifying",
        checkpointRequired: true,
      };
      commands = [{ type: "checkpoint", reason: "verification_started" }];
      break;
    case "verification_finished":
      nextState = {
        ...state,
        phase: "executing_tool",
        checkpointRequired: true,
      };
      commands = [{ type: "checkpoint", reason: "verification_finished" }];
      break;
    case "run_cancelled":
      nextState = {
        ...state,
        phase: "cancelled",
        pendingToolCalls: 0,
        checkpointRequired: true,
      };
      commands = [
        { type: "checkpoint", reason: "final" },
        { type: "finalize", reason: "cancelled" },
      ];
      break;
    case "run_failed":
      nextState = {
        ...state,
        phase: "failed",
        pendingToolCalls: 0,
        checkpointRequired: true,
      };
      commands = [
        { type: "checkpoint", reason: "final" },
        { type: "finalize", reason: "failed" },
      ];
      break;
    case "run_completed":
      nextState = {
        ...state,
        phase: "completed",
        pendingToolCalls: 0,
        checkpointRequired: true,
      };
      commands = [
        { type: "checkpoint", reason: "final" },
        { type: "finalize", reason: "completed" },
      ];
      break;
  }

  assertRunKernelInvariants(nextState, commands);
  return {
    state: nextState,
    commands,
  };
}

export function transitionRunKernel(event: RunKernelEvent): RunKernelTransition {
  return transitionRunKernelState(
    createRunKernelState({ maxSteps: 1, phase: "routing_model_response" }),
    event,
  );
}
