import type {
  AgentResult,
  AgentSession,
  RuntimeInput,
  ToolCall,
  ToolResult,
} from "@code-mind/shared";
import type {
  HumanApprovalPortAdapter,
  PermissionPort,
  RunKernelPorts,
  ToolExecutionPort,
} from "../../kernel/ports.js";
import type { ResultBuilder } from "../../result-builder.js";
import type { LoopPolicy } from "../../task-strategy.js";
import type { SubagentManager } from "@code-mind/capabilities";
import type { SessionLifecycleDeps } from "../session-lifecycle.js";
import type { RunState } from "../types.js";
import type { SessionStorePort } from "../ports/session-store-port.js";

export type ToolCallOutcome =
  | { type: "continue" }
  | { type: "done"; result: AgentResult };

export interface ToolCallHandlerDeps {
  permission: PermissionPort;
  humanApproval: HumanApprovalPortAdapter;
  subagentManager?: SubagentManager | undefined;
  tools: ToolExecutionPort;
  observation: import("../../kernel/ports.js").ObservationPort;
  resultBuilder: ResultBuilder;
  lifecycle: SessionLifecycleDeps;
  verification: import("../../kernel/ports.js").VerificationPort;
  review: import("../../kernel/ports.js").ReviewPort;
  finalize: (result: AgentResult, runState: RunState) => AgentResult;
  checkpointPort: RunKernelPorts["stateStore"];
}

export type ToolCallContext = {
  sessionStore: SessionStorePort;
  session: AgentSession;
  input: RuntimeInput;
  runState: RunState;
  strategy: LoopPolicy;
  toolCall: ToolCall;
  stepNumber: number;
  stepIndex: number;
};

export type RejectionInfo = {
  allowed: boolean;
  reason: string;
  status?: "permission_denied" | "user_rejected";
  source?: import("../../result-status.js").RejectionSource;
  rejectionKind?: import("../../result-status.js").RejectionKind;
};

export type ToolCallHandlerSlice = Pick<
  ToolCallHandlerDeps,
  | "permission"
  | "humanApproval"
  | "subagentManager"
  | "observation"
  | "resultBuilder"
  | "lifecycle"
  | "verification"
  | "review"
  | "finalize"
  | "checkpointPort"
>;

export const TOOL_OUTPUT_PREVIEW_MAX = 800;

export function buildToolDisplayExtras(result: ToolResult): {
  outputPreview?: string;
  exitCode?: number;
  filePath?: string;
} {
  const extras: {
    outputPreview?: string;
    exitCode?: number;
    filePath?: string;
  } = {};

  if (result.output) {
    extras.outputPreview = result.output.slice(0, TOOL_OUTPUT_PREVIEW_MAX);
  }
  if (result.exitCode !== undefined) {
    extras.exitCode = result.exitCode;
  }

  const filePath = result.metadata?.filePath ?? (result.data as { path?: string } | undefined)?.path;
  if (typeof filePath === "string") {
    extras.filePath = filePath;
  }

  return extras;
}

export function readSubagentName(toolCall: ToolCall): string {
  const value = toolCall.arguments.agentName;
  return typeof value === "string" ? value.trim() : "";
}

export function readSubagentTask(toolCall: ToolCall): string {
  const value = toolCall.arguments.task;
  return typeof value === "string" ? value.trim() : "";
}

export function readChildSessionId(result: ToolResult): string {
  if (
    typeof result.data === "object" &&
    result.data !== null &&
    "childSessionId" in result.data &&
    typeof (result.data as { childSessionId?: unknown }).childSessionId === "string"
  ) {
    return (result.data as { childSessionId: string }).childSessionId;
  }
  return "";
}
