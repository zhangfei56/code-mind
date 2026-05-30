import type { RunKernelPhase, RunKernelState } from "@code-mind/shared";

export type { RunKernelPhase, RunKernelState };

export function createRunKernelState(input: {
  maxSteps: number;
  step?: number;
  phase?: RunKernelPhase;
  closingTurn?: boolean;
}): RunKernelState {
  return {
    phase: input.phase ?? "initializing",
    step: input.step ?? 0,
    maxSteps: input.maxSteps,
    closingTurn: input.closingTurn ?? false,
    pendingToolCalls: 0,
    checkpointRequired: true,
  };
}
