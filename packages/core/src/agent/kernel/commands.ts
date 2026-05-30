import type { ToolCall } from "@code-mind/shared";

export type RunKernelCommand =
  | {
      type: "checkpoint";
      reason:
        | "step_start"
        | "prompt_assembled"
        | "model_response"
        | "tool_result"
        | "approval_interrupt"
        | "recovery"
        | "verification_started"
        | "verification_finished"
        | "final";
    }
  | {
      type: "assemble_prompt";
    }
  | {
      type: "call_model";
    }
  | {
      type: "handle_tool_calls";
      toolCalls: ToolCall[];
    }
  | {
      type: "complete_from_model";
      responseText: string;
      forceSummary: boolean;
    }
  | {
      type: "finalize";
      reason: "completed" | "cancelled" | "failed" | "step_limit";
    };
