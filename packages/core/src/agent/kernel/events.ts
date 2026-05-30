import type { ModelResponse } from "@code-mind/shared";

export type RunKernelEvent =
  | {
      type: "run_started";
      maxSteps: number;
    }
  | {
      type: "step_started";
      step: number;
      maxSteps: number;
      closingTurn: boolean;
    }
  | {
      type: "prompt_assembled";
    }
  | {
      type: "model_response_received";
      response: Pick<ModelResponse, "text" | "toolCalls" | "finishReason">;
      enterClosingTurn: boolean;
    }
  | {
      type: "tool_calls_handled";
    }
  | {
      type: "approval_requested";
    }
  | {
      type: "approval_resolved";
      approved: boolean;
    }
  | {
      type: "recovery_requested";
    }
  | {
      type: "verification_started";
    }
  | {
      type: "verification_finished";
      passed: boolean;
    }
  | {
      type: "run_cancelled";
    }
  | {
      type: "run_failed";
    }
  | {
      type: "run_completed";
    };
