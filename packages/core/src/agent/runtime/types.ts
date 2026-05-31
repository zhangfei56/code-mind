import type { ContextManager, ModelProvider } from "@code-mind/shared";
import type { ToolRegistry, ToolExecutor } from "@code-mind/execution";
import type { PermissionEngine, SafetyGuard } from "@code-mind/security";
import type { SessionStorePort } from "./ports/session-store-port.js";
import type { ExtensionRegistry, HookSystem, SubagentManager } from "@code-mind/capabilities";
import type { ReviewEngine, VerificationPipeline } from "@code-mind/verify";
import type {
  PermissionDecision,
  ToolCall,
  ToolContext,
  AgentSession,
} from "@code-mind/shared";

export type {
  ProgressState,
  ExplorationState,
  VerificationState,
  StepBudgetState,
  RunState,
} from "./run-state.js";
export {
  createRunState,
  getEffectiveMaxSteps,
  readRequestedMaxSteps,
} from "./run-state.js";

export interface PermissionPrompter {
  approve(
    sessionId: string,
    toolCall: ToolCall,
    decision: Extract<PermissionDecision, { type: "ask" }>,
    options?: {
      onPending?: (approvalId: string) => void | Promise<void>;
    },
  ): Promise<{ approved: boolean; approvalId?: string }>;
}

export interface RuntimeDependencies {
  contextManager?: ContextManager;
  permissionEngine?: PermissionEngine;
  safetyGuard?: SafetyGuard;
  hookSystem?: HookSystem;
  toolRegistry?: ToolRegistry;
  toolExecutor?: ToolExecutor;
  extensionRegistry?: ExtensionRegistry;
  subagentManager?: SubagentManager;
  sessionStoreFactory?: (workspaceRoot: string) => SessionStorePort;
  permissionPrompter?: PermissionPrompter;
  verificationPipeline?: VerificationPipeline;
  reviewEngine?: ReviewEngine;
  compactionPolicy?: import("@code-mind/shared").CompactionPolicy;
  compactionModel?: ModelProvider;
}

export function createToolContext(
  session: AgentSession,
  abortSignal?: AbortSignal,
  effectiveMode?: import("@code-mind/shared").AgentMode,
): ToolContext {
  return {
    sessionId: session.id,
    workspaceRoot: session.workspaceRoot,
    cwd: session.task.cwd,
    mode: effectiveMode ?? session.task.mode,
    ...(abortSignal === undefined ? {} : { abortSignal }),
  };
}
