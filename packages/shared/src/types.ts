export type MessageRole = "system" | "user" | "assistant" | "tool";

import type { AgentMode } from "./agent-modes.js";

export type { AgentMode } from "./agent-modes.js";
export type { ActivityKind, ToolActivityCounts } from "./activity.js";
export type CompletionKind =
  | "diagnosed_only"
  | "plan_delivered"
  | "verified_only"
  | "modified_unverified"
  | "modified_verified"
  | "verification_failed"
  | "review_failed"
  | "interrupted_with_findings"
  | "incomplete_summary"
  | "no_progress";

export type ToolRiskLevel = "low" | "medium" | "high" | "critical";
export type EngineeringRiskLevel =
  | "safe"
  | "low"
  | "medium"
  | "high"
  | "critical";

export type PermissionDecision =
  | { type: "allow" }
  | { type: "ask"; reason: string }
  | { type: "deny"; reason: string };

export type AgentResultStatus =
  | "success"
  | "failed"
  | "incomplete"
  | "stopped_by_limit"
  | "permission_denied"
  | "user_rejected"
  | "cancelled";

export type SessionRuntimeStatus =
  | "idle"
  | "running"
  | "retrying"
  | "awaiting_approval"
  | "compacting";

export type SessionStatus = SessionRuntimeStatus | AgentResultStatus;

export interface UserTask {
  id: string;
  text: string;
  cwd: string;
  mode: AgentMode;
  requestedModel?: string;
  maxSteps: number;
  metadata?: Record<string, unknown>;
}

export interface AgentProfile {
  id: string;
  name: string;
  systemPrompt: string;
  toolAllowlist?: string[];
  preferredModel?: string;
  metadata?: Record<string, unknown>;
}

export interface InternalMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  /** DeepSeek thinking mode: chain-of-thought for assistant turns (required when tool_calls present). */
  reasoningContent?: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  riskLevel?: ToolRiskLevel;
  raw?: unknown;
}

export interface Artifact {
  type: string;
  path: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  output: string;
  data?: T;
  error?: string;
  exitCode?: number;
  artifacts?: Artifact[];
  metadata?: Record<string, unknown>;
}

export interface Observation {
  toolCall: ToolCall;
  toolResult: ToolResult;
  createdAt: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ResponseFormat {
  type: "text" | "json_schema";
  schema?: Record<string, unknown>;
}

export interface ModelRequest {
  messages: InternalMessage[];
  tools?: ToolSchema[];
  responseFormat?: ResponseFormat;
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface ModelResponse {
  text: string;
  toolCalls: ToolCall[];
  finishReason: "stop" | "tool_call" | "length" | "error";
  /** DeepSeek thinking mode chain-of-thought, separate from final answer text. */
  reasoningContent?: string;
  usage?: TokenUsage;
  raw: unknown;
}

export interface ModelCapabilities {
  toolCall: boolean;
  parallelToolCall: boolean;
  jsonSchema: boolean;
  vision: boolean;
  reasoning: boolean;
  streaming?: boolean;
  maxContextTokens: number;
  maxOutputTokens: number;
  supportsPromptCache: boolean;
  supportsSystemMessage?: boolean;
  supportsDeveloperMessage?: boolean;
  supportsComputerUse: boolean;
}

export interface ModelInput {
  messages: InternalMessage[];
}

export type ModelStreamEvent =
  | { type: "reasoning_delta"; delta: string }
  | { type: "content_delta"; delta: string }
  | { type: "done"; response: ModelResponse }
  | { type: "error"; error: unknown };

export interface ModelProvider {
  name: string;
  chat(request: ModelRequest): Promise<ModelResponse>;
  stream?(request: ModelRequest): AsyncIterable<ModelStreamEvent>;
  countTokens?(input: ModelInput): Promise<TokenUsage>;
  getCapabilities(): ModelCapabilities;
}

export interface ToolContext {
  sessionId: string;
  workspaceRoot: string;
  cwd: string;
  mode: AgentMode;
  abortSignal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface Tool<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  schema: ToolSchema;
  riskLevel: ToolRiskLevel;
  /** When omitted, tool is exposed only in edit and agent modes. */
  availableInModes?: AgentMode[];
  execute(args: TArgs, context: ToolContext): Promise<ToolResult<TResult>>;
}

export interface PermissionRequest {
  toolCall: ToolCall;
  mode: AgentMode;
  workspaceRoot: string;
  planModeActive?: boolean;
  planDraftRelativePath?: string;
  /** True when the active session is a child sub-agent run. */
  isSubagentSession?: boolean;
  /** Resolved tool allowlist when checking run_subagent. */
  subagentTools?: string[];
  subagentRole?: "explore" | "plan" | "general";
  /** False when the name is not explore/plan/custom-defined. */
  subagentKnown?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SafetyCheckInput {
  toolCall: ToolCall;
  mode: AgentMode;
  workspaceRoot: string;
}

export interface ContextBuildInput {
  session: AgentSession;
  task: UserTask;
  profile: AgentProfile;
}

export interface ContextSnapshot {
  messages: InternalMessage[];
  modelOptions?: {
    temperature?: number;
    maxTokens?: number;
  };
  metadata?: Record<string, unknown>;
}

export interface AgentSession {
  id: string;
  task: UserTask;
  workspaceRoot: string;
  profile: AgentProfile;
  modelName: string;
  messages: InternalMessage[];
  observations: Observation[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export type SessionRole = "plan" | "execute" | "standard";

export interface SessionManifest {
  id: string;
  projectPath: string;
  /** Directory where tools execute (may differ from projectPath for worktrees/subdirs). */
  executionCwd?: string;
  task: string;
  mode: AgentMode;
  model: string;
  status: SessionStatus;
  completion?: CompletionKind;
  createdAt: string;
  updatedAt: string;
  /** User/CLI requested step limit before recommendMaxSteps. */
  requestedMaxSteps?: number;
  /** Step limit used to initialize the run loop (after recommendMaxSteps). */
  maxSteps?: number;
  /** Final effective step budget when the session ended (base + recovery extras). */
  effectiveMaxSteps?: number;
  /** Files modified during the session (from apply_patch). */
  modifiedFiles?: string[];
  /** plan-first workflow role */
  sessionRole?: SessionRole;
  /** Execute session spawned from this plan session. */
  executeSessionId?: string;
  /** Plan session that produced this execute session. */
  planSessionId?: string;
}

export interface PlannedFileChange {
  path: string;
  action: "read" | "modify" | "create" | "delete";
  reason: string;
  riskLevel: EngineeringRiskLevel;
}

export interface PlanStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  expectedFiles?: string[];
  verification?: string[];
}

export interface VerificationStep {
  command?: string;
  tool?: string;
  description: string;
  required: boolean;
}

export interface RollbackPlan {
  summary: string;
  steps: string[];
}

export interface AgentPlan {
  id: string;
  task: string;
  summary: string;
  riskLevel: EngineeringRiskLevel;
  affectedFiles: PlannedFileChange[];
  steps: PlanStep[];
  verification: VerificationStep[];
  rollback?: RollbackPlan;
}

export interface GitStatusSummary {
  branch: string;
  clean: boolean;
  modified: string[];
  untracked: string[];
  deleted: string[];
}

export interface GitChangedFiles {
  modified: string[];
  created: string[];
  deleted: string[];
  untracked: string[];
}

export interface WorktreeInfo {
  taskId: string;
  path: string;
  branchName: string;
  baseRef: string;
  createdAt: string;
}

export interface TestProfile {
  language: "typescript" | "python" | "rust" | "go" | "unknown";
  framework?: string;
  commands: {
    test?: string;
    lint?: string;
    build?: string;
    typecheck?: string;
  };
}

export interface FailedTest {
  name: string;
  file?: string;
  message: string;
  expected?: string;
  received?: string;
}

export interface TestFailureSummary {
  failedTests: FailedTest[];
  errorMessages: string[];
  likelyFiles: string[];
  rawExcerpt: string;
}

export interface TestResult {
  success: boolean;
  command: string;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  summary: TestFailureSummary;
}

export interface DiagnosticItem {
  path: string;
  line: number;
  message: string;
  severity: "error" | "warning";
}

export interface ReviewIssue {
  severity: "info" | "warning" | "error";
  file?: string;
  line?: number;
  message: string;
}

export interface ReviewResult {
  passed: boolean;
  issues: ReviewIssue[];
  suggestions: string[];
  requiresAnotherIteration: boolean;
}

export interface VerificationStepResult {
  name: string;
  command?: string;
  success: boolean;
  exitCode?: number;
  durationMs?: number;
  summary: string;
}

export interface VerificationResult {
  passed: boolean;
  steps: VerificationStepResult[];
  summary: string;
}

export interface McpServerConfig {
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface HookMatcher {
  tool?: string;
}

export type HookEvent =
  | "SessionStart"
  | "UserPromptSubmit"
  | "BeforeModelCall"
  | "AfterModelCall"
  | "PreToolUse"
  | "PostToolUse"
  | "ToolError"
  | "BeforePatchApply"
  | "AfterPatchApply"
  | "BeforeShellRun"
  | "AfterShellRun"
  | "BeforeContextCompact"
  | "AfterContextCompact"
  | "BeforeReview"
  | "AfterReview"
  | "SessionEnd";

export interface HookDefinition {
  name: string;
  type: "command" | "script" | "http";
  command?: string;
  path?: string;
  url?: string;
  timeoutMs?: number;
  matcher?: HookMatcher;
  onFailure?: "continue" | "deny" | "ask";
}

export interface HookInput {
  event: HookEvent;
  sessionId: string;
  projectPath: string;
  mode: AgentMode;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  modelRequest?: ModelRequest;
  modelResponse?: ModelResponse;
  patch?: string;
  diff?: string;
  metadata?: Record<string, unknown>;
}

export type HookResult =
  | { action: "continue" }
  | { action: "deny"; reason: string }
  | { action: "ask"; reason: string }
  | { action: "modify_input"; input: unknown }
  | { action: "add_context"; context: string }
  | { action: "replace_result"; result: unknown };

export interface SkillDefinition {
  name: string;
  description: string;
  path: string;
  content: string;
  tools?: string[];
  allowedModes?: AgentMode[];
}

export interface SubagentDefinition {
  name: string;
  description: string;
  role?: "explore" | "plan" | "general";
  model?: string;
  mode?: AgentMode;
  tools: string[];
}

export interface CommandDefinition {
  name: string;
  description: string;
  path: string;
  content: string;
  mode?: AgentMode;
  skill?: string;
  tools?: string[];
}

export interface PluginDefinition {
  name: string;
  version: string;
  description: string;
  path: string;
  skills?: string[];
  agents?: string[];
  hooks?: Array<{ event: HookEvent; path: string }>;
  commands?: Array<{ name: string; path: string }>;
  permissions?: Record<string, unknown>;
  enabled?: boolean;
}

export interface CapabilityManifest {
  models: string[];
  tools: string[];
  mcpServers: string[];
  skills: string[];
  subagents: string[];
  hooks: string[];
  commands: string[];
  plugins: string[];
}

export type CapabilitySelectionTrigger =
  | "explicit"
  | "semantic"
  | "workflow"
  | "file_type"
  | "runtime_mode"
  | "plan_mode"
  | "closing_turn";

export type CapabilityAuditTargetKind =
  | "skill"
  | "plugin"
  | "tool"
  | "hook"
  | "context";

export interface CapabilityAuditReason {
  trigger: CapabilitySelectionTrigger;
  target: string;
  targetKind: CapabilityAuditTargetKind;
  score?: number;
  reason: string;
}

export interface SelectedSkillEntry {
  name: string;
  description: string;
  contextSnippet: string;
  allowedTools?: string[];
}

export interface SelectedPluginEntry {
  name: string;
  description: string;
}

export interface CapabilityContextBlock {
  source: string;
  kind: "skill" | "plugin" | "reference";
  content: string;
}

/** Skill/plugin selection output before tool schemas are merged at runtime. */
export interface CapabilitySelectionResult {
  skills: SelectedSkillEntry[];
  plugins: SelectedPluginEntry[];
  contextBlocks: CapabilityContextBlock[];
  modePolicies: string[];
  auditReasons: CapabilityAuditReason[];
}

/** Full selector output consumed by prompt assembly and model request. */
export interface SelectedCapabilities extends CapabilitySelectionResult {
  toolSchemas: ToolSchema[];
}

export interface ExtensionSettings {
  mcp?: {
    servers?: Record<string, McpServerConfig>;
  };
  hooks?: Partial<Record<HookEvent, HookDefinition[]>>;
  extensions?: {
    plugins?: { enabled?: string[] };
    skills?: { enabled?: string[] };
    subagents?: { enabled?: string[] };
  };
  commands?: {
    paths?: string[];
  };
}

export interface PermissionDecisionRecord {
  sessionId: string;
  toolCallId: string;
  toolName: string;
  decision: PermissionDecision["type"];
  reason: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export type ApprovalStatus = "pending" | "approved" | "denied";

export interface ApprovalRecord {
  id: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  reason: string;
  status: ApprovalStatus;
  createdAt: string;
  resolvedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface RuntimeInput {
  task: UserTask;
  profile: AgentProfile;
  model: ModelProvider;
  eventBus?: import("./agent-event.js").AgentEventBus;
  resumeSessionId?: string;
  sessionRoot?: string;
  abortSignal?: AbortSignal;
  /** Approve plan text from exit_plan_mode or plan-first orchestration. */
  approvePlan?: (request: { planSessionId: string; planText: string }) => Promise<boolean>;
  autoApprovePlan?: boolean;
  onStatusChange?: (status: SessionStatus) => void | Promise<void>;
  onEvent?: (event: import("./agent-event.js").AgentEvent) => void | Promise<void>;
}

export interface ContextManager {
  build(input: ContextBuildInput): Promise<ContextSnapshot>;
  addObservation(session: AgentSession, observation: Observation): Promise<void>;
}

export type RejectionSource = "permission" | "hook" | "safety";
export type RejectionKind = "policy_denied" | "user_rejected";

export interface AgentResult {
  sessionId: string;
  runId: string;
  /** Factual termination status from the run loop. */
  status: AgentResultStatus;
  /** User-facing outcome; may differ from status when work completed before a soft stop. */
  effectiveStatus?: AgentResultStatus;
  finalText: string;
  steps: number;
  modelName: string;
  summary?: string;
  metadata?: {
    completion?: CompletionKind;
    activitySummary?: {
      last: import("./activity.js").ActivityKind;
      counts: import("./activity.js").ToolActivityCounts;
    };
    modifiedFiles?: string[];
    verification?: VerificationResult;
    rejectionSource?: RejectionSource;
    rejectionKind?: RejectionKind;
    requestedMaxSteps?: number;
    baseMaxSteps?: number;
    effectiveMaxSteps?: number;
    [key: string]: unknown;
  };
}
