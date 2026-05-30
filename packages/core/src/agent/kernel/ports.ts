import type {
  AgentEventInput,
  AgentResult,
  AgentSession,
  ContextSnapshot,
  ModelRequest,
  ModelResponse,
  Observation,
  PermissionDecision,
  PermissionRequest,
  ReviewResult,
  RuntimeInput,
  ToolCall,
  ToolContext,
  ToolResult,
  VerificationResult,
} from "@code-mind/shared";
import type { RunState } from "../runtime/run-state.js";

export interface PromptAssemblyPort {
  assemble(input: RuntimeInput, runState: RunState): Promise<ContextSnapshot>;
}

export interface ModelPort {
  call(request: ModelRequest): Promise<ModelResponse>;
}

export interface PermissionPort {
  check(request: PermissionRequest): Promise<PermissionDecision>;
}

export interface ToolExecutionPort {
  execute(toolCall: ToolCall, context: ToolContext): Promise<ToolResult>;
}

export interface StateStorePort {
  checkpoint(runState: RunState, reason: string): Promise<void>;
}

export interface ApprovalFlowCallbacks {
  onAwaiting?: (info: {
    reason: string;
    source: "permission" | "hook";
  }) => void | Promise<void>;
  onPending?: (info: {
    approvalId: string;
    reason: string;
    source: "permission" | "hook";
  }) => void | Promise<void>;
  onResolved?: (info: {
    allowed: boolean;
    approvalId?: string;
    reason: string;
    source: "permission" | "hook";
  }) => void | Promise<void>;
}

export interface PermissionResolveResult {
  allowed: boolean;
  reason: string;
  status?: "permission_denied" | "user_rejected";
  approvalId?: string;
  source?: "permission" | "hook";
  rejectionKind?: "policy_denied" | "user_rejected";
}

/** Kernel human-approval port (request + permission/hook resolve). */
export interface HumanApprovalPort {
  request(input: {
    sessionId: string;
    toolCall: ToolCall;
    reason: string;
  }): Promise<boolean>;
  resolve(
    sessionId: string,
    toolCall: ToolCall,
    decision: PermissionDecision,
    callbacks?: ApprovalFlowCallbacks,
    source?: "permission" | "hook",
    abortSignal?: AbortSignal,
  ): Promise<PermissionResolveResult>;
}

/** Alias for runtime wiring; same contract as {@link HumanApprovalPort}. */
export type HumanApprovalPortAdapter = HumanApprovalPort;

export interface EventSinkPort {
  publish(event: AgentEventInput): Promise<void>;
}

export interface CompletionPort {
  finalize(result: AgentResult, runState: RunState): AgentResult;
}

export interface ObservationPort {
  addObservation(session: AgentSession, observation: Observation): Promise<void>;
}

export interface VerificationPort {
  run(cwd: string, options?: import("@code-mind/verify").VerificationOptions): Promise<VerificationResult>;
}

export interface ReviewPort {
  review(
    input: import("@code-mind/verify").ReviewInput,
  ): ReviewResult;
}

export interface RunKernelPorts {
  promptAssembly: PromptAssemblyPort;
  model: ModelPort;
  permission: PermissionPort;
  tools: ToolExecutionPort;
  stateStore: StateStorePort;
  humanApproval: HumanApprovalPortAdapter;
  events: EventSinkPort;
  completion: CompletionPort;
  observation: ObservationPort;
  verification: VerificationPort;
  review: ReviewPort;
}

