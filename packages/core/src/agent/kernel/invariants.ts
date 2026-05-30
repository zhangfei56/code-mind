import type { RunKernelCommand } from "./commands.js";
import type { RunKernelState } from "./state.js";

const WORK_COMMANDS = new Set<RunKernelCommand["type"]>([
  "assemble_prompt",
  "call_model",
  "handle_tool_calls",
  "complete_from_model",
]);

function hasWorkCommand(commands: RunKernelCommand[]): boolean {
  return commands.some((command) => WORK_COMMANDS.has(command.type));
}

export function assertRunKernelInvariants(
  state: RunKernelState,
  commands: RunKernelCommand[],
): void {
  if (state.step < 0) {
    throw new Error("Run kernel invariant failed: step cannot be negative.");
  }

  if (state.maxSteps < 1) {
    throw new Error("Run kernel invariant failed: maxSteps must be positive.");
  }

  if (state.step > state.maxSteps) {
    throw new Error("Run kernel invariant failed: step cannot exceed maxSteps.");
  }

  if (
    (state.phase === "completed" || state.phase === "cancelled" || state.phase === "failed") &&
    hasWorkCommand(commands)
  ) {
    throw new Error("Run kernel invariant failed: terminal runs cannot request more work.");
  }

  if (
    state.closingTurn &&
    commands.some((command) => command.type === "handle_tool_calls" || command.type === "call_model")
  ) {
    throw new Error("Run kernel invariant failed: closing turn cannot request tools or model calls.");
  }

  if (
    state.pendingToolCalls > 0 &&
    state.phase !== "handling_tools" &&
    state.phase !== "awaiting_approval" &&
    state.phase !== "executing_tool" &&
    state.phase !== "verifying"
  ) {
    throw new Error("Run kernel invariant failed: pending tool calls require a tool phase.");
  }

  if (
    (state.phase === "handling_tools" ||
      state.phase === "awaiting_approval" ||
      state.phase === "executing_tool") &&
    state.pendingToolCalls < 1
  ) {
    throw new Error("Run kernel invariant failed: tool handling phase requires pending tool calls.");
  }
}
