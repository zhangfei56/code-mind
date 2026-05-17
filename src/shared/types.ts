export type MessageRole = "system" | "user" | "assistant" | "tool";

export type RunMode =
  | "read_only"
  | "suggest"
  | "auto_edit"
  | "full_auto"
  | "sandbox_auto";

export type ToolRiskLevel = "low" | "medium" | "high" | "critical";

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
  maxContextTokens: number;
  maxOutputTokens: number;
  supportsPromptCache: boolean;
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

export interface RuntimeInput {
  task: UserTask;
  profile: AgentProfile;
  model: ModelProvider;
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
