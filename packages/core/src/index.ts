/** L1 — Product API */
export {
  AgentLoopController,
  type PermissionPrompter,
} from "./agent/runtime/agent-loop-controller.js";
export {
  runAgentSession,
  executeFromApprovedPlan,
  type RunAgentSessionInput,
  type ExecuteFromApprovedPlanInput,
  type RunAgentSessionResult,
} from "./agent/run-session.js";
export { ResultBuilder } from "./agent/result-builder.js";
export {
  getEffectiveResultStatus,
  isAgentRunSuccessful,
  attachRejectionMetadata,
  type RejectionSource,
  type RejectionKind,
} from "./agent/result-status.js";
export {
  applyRecommendedMaxSteps,
  recommendMaxSteps,
  createEmptyExplorationEvidence,
  createLoopPolicy,
  isBroadRepoRootTask,
  shouldEnterClosingTurn,
  type ExplorationEvidence,
  type LoopPolicy,
} from "./agent/task-strategy.js";

/** L2 — Composition helpers (apps/tests; product loop assembly → `@code-mind/agent-composition`) */
export {
  createAgentLoopController,
  createAgentLoopRuntimeWiring,
  type AgentLoopRuntimeWiring,
} from "./agent/runtime/runtime-wiring.js";
export {
  createSessionStorePort,
  type SessionStorePort,
} from "./agent/runtime/ports/session-store-port.js";
export { createOrchestrationSessionStore } from "./agent/session-store-factory.js";
export {
  createDefaultRuntimeDependencies,
  createDefaultToolRegistry,
} from "./agent/runtime/default-runtime-deps.js";
export type { RuntimeDependencies } from "./agent/runtime/types.js";
export {
  serializeRunState,
  deserializeRunState,
  restoreRunStateForSession,
  normalizeKernelStateForResume,
} from "./agent/runtime/run-state-persistence.js";
export { buildRuntimePlan } from "./agent/runtime/plan-artifact.js";
export {
  canEnterCollaborationPlanMode,
  getCollaborationToolSchemas,
  getPermissionMode,
  isPlanDraftPath,
  resolvePlanDraftRelativePath,
} from "./agent/runtime/plan-mode.js";
export { registerPlanModeTools } from "./agent/runtime/plan-mode-tools.js";
export {
  RuntimeEventHub,
  runtimeEventHub,
  createRunEventPublisher,
  type RuntimeEventListener,
} from "./agent/runtime/runtime-event-hub.js";

/** L3 — Kernel contracts + runtime test surface (behavior locked by tests) */
export {
  createRunState,
  getEffectiveMaxSteps,
  readRequestedMaxSteps,
  type RunState,
  type ProgressState,
  type ExplorationState,
  type VerificationState,
  type StepBudgetState,
} from "./agent/runtime/run-state.js";
export { waitWithAbortSignal, RunAbortedError } from "./agent/runtime/abortable.js";
export {
  selectToolSchemasForModel,
  type ToolSchemaSelection,
  type ToolSchemaSelectionTrigger,
} from "./agent/runtime/tool-schema-selection.js";
export {
  messageAssistantEvent,
  messageUserEvent,
  toolCallEvent,
  toolResultEvent,
} from "./agent/runtime/agent-events.js";
export { finalizeResult, classifyCompletion } from "./agent/runtime/finalize.js";
export { resolvePermission } from "./agent/runtime/permission.js";
export { syncModifiedFilesFromWorkspace, recordToolModifiedFile } from "./agent/runtime/change-tracking.js";
export {
  markCandidateFileLocated,
  markEntryFileRead,
  markProjectRootConfirmed,
  markVerificationCommandKnown,
  updateExplorationEvidence,
} from "./agent/runtime/exploration-evidence.js";
export { runAutomaticVerification } from "./agent/runtime/verification.js";
export {
  runVerifyOnlyAutomaticVerificationIfNeeded,
  shellLooksLikeVerification,
  shouldRunVerifyOnlyAutomaticVerification,
} from "./agent/runtime/verification.js";
export { completeRun, compactSessionIfNeeded, type SessionLifecycleDeps } from "./agent/runtime/session-lifecycle.js";
export {
  tryReviewRecoveryBeforeCompletion,
  type ReviewRecoveryOutcome,
} from "./agent/runtime/review-runtime.js";
export {
  applyRunKernelEventAndCheckpoint,
  dispatchRunKernelCommands,
  expectRunKernelCommand,
  isRunKernelCommand,
} from "./agent/runtime/kernel-runtime.js";
export {
  createStaticRuntimePorts,
  createRunScopedKernelPorts,
  createHumanApprovalPort,
  createModelPort,
  createPermissionPort,
  createPromptAssemblyPort,
  createToolExecutionPort,
  createCompactionPort,
  type CompactionPort,
} from "./agent/runtime/ports/index.js";
export {
  assertRunKernelInvariants,
  canAcceptToolCallsHandled,
  createRunKernelState,
  primaryRunKernelCommand,
  transitionRunKernel,
  transitionRunKernelState,
  type ApprovalFlowCallbacks,
  type RunKernelCommand,
  type RunKernelEvent,
  type RunKernelPhase,
  type RunKernelPorts,
  type RunKernelState,
  type RunKernelTransition,
  type HumanApprovalPort,
  type HumanApprovalPortAdapter,
  type PermissionResolveResult,
  type ObservationPort,
  type VerificationPort,
  type ReviewPort,
} from "./agent/kernel/index.js";
