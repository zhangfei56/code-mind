export type MessageRole = "system" | "user" | "assistant" | "tool";

export type RunMode =
  | "plan"
  | "read_only"
  | "suggest"
  | "auto_edit"
  | "full_auto"
  | "sandbox_auto";

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
  | "stopped_by_limit"
  | "permission_denied"
  | "user_rejected"
  | "cancelled";

export type SessionStatus = "running" | AgentResultStatus;

export interface UserTask {
  id: string;
  text: string;
  cwd: string;
  mode: RunMode;
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
  metadata?: Record<string, unknown>;
}

export interface ModelResponse {
  text: string;
  toolCalls: ToolCall[];
  finishReason: "stop" | "tool_call" | "length" | "error";
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

export interface ModelStreamEvent {
  type: "message" | "tool_call" | "done" | "error";
  data: unknown;
}

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
  mode: RunMode;
  abortSignal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface Tool<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  schema: ToolSchema;
  riskLevel: ToolRiskLevel;
  execute(args: TArgs, context: ToolContext): Promise<ToolResult<TResult>>;
}

export interface PermissionRequest {
  toolCall: ToolCall;
  mode: RunMode;
  workspaceRoot: string;
  metadata?: Record<string, unknown>;
}

export interface SafetyCheckInput {
  toolCall: ToolCall;
  mode: RunMode;
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

export interface SessionManifest {
  id: string;
  projectPath: string;
  task: string;
  mode: RunMode;
  model: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  maxSteps?: number;
}

export type TaskStatus =
  | "created"
  | "planning"
  | "awaiting_approval"
  | "executing"
  | "verifying"
  | "reviewing"
  | "completed"
  | "failed"
  | "cancelled"
  | "rolled_back"
  | "needs_user_input";

export interface TaskState {
  taskId: string;
  status: TaskStatus;
  currentStep?: string;
  planId?: string;
  updatedAt: string;
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

export interface PlannedPatch {
  id: string;
  description: string;
  targetFiles: string[];
  dependencies: string[];
  verification?: string[];
}

export interface PatchPlan {
  planId: string;
  patches: PlannedPatch[];
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
  runMode: RunMode;
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
  allowedModes?: RunMode[];
}

export interface SubagentDefinition {
  name: string;
  description: string;
  model?: string;
  tools: string[];
  write?: boolean;
  shell?: boolean;
}

export interface CommandDefinition {
  name: string;
  description: string;
  path: string;
  content: string;
  mode?: RunMode;
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

export interface SessionRecord {
  sessionId: string;
  type:
    | "user_message"
    | "assistant_message"
    | "tool_call"
    | "tool_result"
    | "patch"
    | "summary"
    | "event";
  createdAt: string;
  payload: Record<string, unknown>;
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

export interface AuditRecord {
  sessionId: string;
  type:
    | "model_call"
    | "hook_execution"
    | "permission_decision"
    | "user_approval"
    | "tool_execution"
    | "tool_result"
    | "context_compact";
  createdAt: string;
  payload: Record<string, unknown>;
}

export interface RuntimeInput {
  task: UserTask;
  profile: AgentProfile;
  model: ModelProvider;
  resumeSessionId?: string;
  sessionRoot?: string;
}

export interface ContextManager {
  build(input: ContextBuildInput): Promise<ContextSnapshot>;
  addObservation(session: AgentSession, observation: Observation): Promise<void>;
}

export interface AgentResult {
  sessionId: string;
  status: AgentResultStatus;
  finalText: string;
  steps: number;
  modelName: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}
