/** Persisted and in-memory kernel phase for the agent run loop. */
export type RunKernelPhase =
  | "initializing"
  | "assembling_prompt"
  | "calling_model"
  | "routing_model_response"
  | "handling_tools"
  | "awaiting_approval"
  | "executing_tool"
  /** Reserved for kernel-integrated automatic verification (see verification_started/finished events). */
  | "verifying"
  | "recovering"
  | "finalizing"
  | "completed"
  | "cancelled"
  | "failed";

export interface RunKernelState {
  phase: RunKernelPhase;
  step: number;
  maxSteps: number;
  closingTurn: boolean;
  pendingToolCalls: number;
  checkpointRequired: boolean;
}
