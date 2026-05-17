# Code Mind Agent 核心协议

> 版本：v0.1  
> 目标：冻结 Runtime、Model、Tools、Session 之间的核心数据结构和接口边界，避免 MVP 期间协议反复变化。

---

## 1. 文档原则

本文件只定义稳定协议，不定义具体实现。

协议设计遵守以下原则：

- Runtime 内部使用统一对象，不直接透传厂商格式。
- 类型优先服务于 Agent Loop、权限系统和审计系统。
- Phase 1 先保留最小字段，但字段语义要支持未来扩展。
- 允许新增字段，不允许随意改变既有字段语义。

---

## 2. 基础枚举和标识

### 2.1 Role

```ts
export type MessageRole =
  | "system"
  | "user"
  | "assistant"
  | "tool";
```

### 2.2 RunMode

```ts
export type RunMode =
  | "read_only"
  | "suggest"
  | "auto_edit"
  | "full_auto"
  | "sandbox_auto";
```

### 2.3 ToolRiskLevel

```ts
export type ToolRiskLevel =
  | "low"
  | "medium"
  | "high"
  | "critical";
```

### 2.4 PermissionDecision

```ts
export type PermissionDecision =
  | { type: "allow" }
  | { type: "ask"; reason: string }
  | { type: "deny"; reason: string };
```

### 2.5 AgentResultStatus

```ts
export type AgentResultStatus =
  | "success"
  | "failed"
  | "stopped_by_limit"
  | "permission_denied"
  | "user_rejected"
  | "cancelled";
```

---

## 3. 用户输入和运行入口

### 3.1 UserTask

```ts
export interface UserTask {
  id: string;
  text: string;
  cwd: string;
  mode: RunMode;
  requestedModel?: string;
  maxSteps: number;
  metadata?: Record<string, unknown>;
}
```

说明：

- `text` 是用户原始任务。
- `cwd` 是任务绑定的 workspace 根目录。
- `mode` 直接影响权限系统。
- `requestedModel` 是用户显式指定模型，可被路由层接收。

### 3.2 AgentProfile

```ts
export interface AgentProfile {
  id: string;
  name: string;
  systemPrompt: string;
  toolAllowlist?: string[];
  preferredModel?: string;
  metadata?: Record<string, unknown>;
}
```

说明：

- Phase 1 可以只使用一个默认 profile。
- 后续不同任务类型通过不同 profile 约束模型行为。

---

## 4. 内部消息协议

### 4.1 InternalMessage

```ts
export interface InternalMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  toolCallId?: string;
  name?: string;
  metadata?: Record<string, unknown>;
}
```

说明：

- `content` 统一使用字符串，复杂对象在 `metadata` 或外部 artifact 中承载。
- `tool` 消息用于把工具执行结果反馈回模型。
- `toolCallId` 用于关联工具调用与工具结果。

### 4.2 Observation

```ts
export interface Observation {
  toolCall: ToolCall;
  toolResult: ToolResult;
  createdAt: string;
}
```

说明：

- Observation 是 Agent Loop 的最小反馈单元。
- Session 保存完整 Observation，Context 只挑选必要部分注入模型。

---

## 5. 模型层协议

### 5.1 ModelProvider

```ts
export interface ModelProvider {
  name: string;
  chat(request: ModelRequest): Promise<ModelResponse>;
  stream?(request: ModelRequest): AsyncIterable<ModelStreamEvent>;
  countTokens?(input: ModelInput): Promise<TokenUsage>;
  getCapabilities(): ModelCapabilities;
}
```

### 5.2 ModelRequest

```ts
export interface ModelRequest {
  messages: InternalMessage[];
  tools?: ToolSchema[];
  responseFormat?: ResponseFormat;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}
```

### 5.3 ModelResponse

```ts
export interface ModelResponse {
  text: string;
  toolCalls: ToolCall[];
  finishReason: "stop" | "tool_call" | "length" | "error";
  usage?: TokenUsage;
  raw: unknown;
}
```

### 5.4 ModelCapabilities

```ts
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
```

### 5.5 TokenUsage

```ts
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}
```

### 5.6 ResponseFormat

```ts
export interface ResponseFormat {
  type: "text" | "json_schema";
  schema?: Record<string, unknown>;
}
```

说明：

- `raw` 必须保留厂商原始返回，便于审计和排错。
- `toolCalls` 必须是标准化后的内部格式，Runtime 不处理原生厂商结构。
- `finishReason` 要显式区分 stop、tool_call、length、error。

---

## 6. 工具层协议

### 6.1 ToolSchema

```ts
export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
```

### 6.2 ToolCall

```ts
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  riskLevel?: ToolRiskLevel;
  raw?: unknown;
}
```

### 6.3 ToolContext

```ts
export interface ToolContext {
  sessionId: string;
  workspaceRoot: string;
  cwd: string;
  mode: RunMode;
  abortSignal?: AbortSignal;
  metadata?: Record<string, unknown>;
}
```

### 6.4 Artifact

```ts
export interface Artifact {
  type: string;
  path: string;
  description?: string;
  metadata?: Record<string, unknown>;
}
```

### 6.5 ToolResult

```ts
export interface ToolResult<T = unknown> {
  success: boolean;
  output: string;
  data?: T;
  error?: string;
  exitCode?: number;
  artifacts?: Artifact[];
  metadata?: Record<string, unknown>;
}
```

### 6.6 Tool

```ts
export interface Tool<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  schema: ToolSchema;
  riskLevel: ToolRiskLevel;
  execute(args: TArgs, context: ToolContext): Promise<ToolResult<TResult>>;
}
```

说明：

- 所有工具必须返回 `ToolResult`，不能自定义返回风格。
- `output` 是给模型看的摘要字符串。
- `data` 是给 Runtime 或 UI 用的结构化结果。
- `artifacts` 用于承载 patch、日志、截图等额外产物。

---

## 7. 权限协议

### 7.1 PermissionRequest

```ts
export interface PermissionRequest {
  toolCall: ToolCall;
  mode: RunMode;
  workspaceRoot: string;
  metadata?: Record<string, unknown>;
}
```

### 7.2 PermissionEngine

```ts
export interface PermissionEngine {
  check(input: PermissionRequest): Promise<PermissionDecision>;
}
```

说明：

- 权限判断输入必须基于标准化后的 `ToolCall`。
- `PermissionDecision` 只允许 `allow / ask / deny` 三态。
- UI 的确认交互不属于 PermissionEngine，属于 Gateway 或交互层。

---

## 8. 上下文协议

### 8.1 ContextBuildInput

```ts
export interface ContextBuildInput {
  session: AgentSession;
  task: UserTask;
  profile: AgentProfile;
}
```

### 8.2 ContextSnapshot

```ts
export interface ContextSnapshot {
  messages: InternalMessage[];
  modelOptions?: {
    temperature?: number;
    maxTokens?: number;
  };
  metadata?: Record<string, unknown>;
}
```

### 8.3 ContextManager

```ts
export interface ContextManager {
  build(input: ContextBuildInput): Promise<ContextSnapshot>;
  addObservation(
    session: AgentSession,
    observation: Observation,
  ): Promise<void>;
}
```

说明：

- Context 是“给模型看的工作集”，不是全量历史库。
- Session 是真实历史源，Context 是派生视图。

---

## 9. Session 和日志协议

### 9.1 AgentSession

```ts
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
```

### 9.2 SessionRecord

```ts
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
```

### 9.3 SessionStore

```ts
export interface SessionStore {
  create(task: UserTask, profile: AgentProfile): Promise<AgentSession>;
  appendRecord(record: SessionRecord): Promise<void>;
  saveSummary(sessionId: string, summary: string): Promise<void>;
}
```

说明：

- Phase 1 可实现为本地文件系统存储。
- 未来可无缝替换为数据库或远端审计服务。

---

## 10. Runtime 协议

### 10.1 RuntimeInput

```ts
export interface RuntimeInput {
  task: UserTask;
  profile: AgentProfile;
  model: ModelProvider;
}
```

### 10.2 AgentResult

```ts
export interface AgentResult {
  sessionId: string;
  status: AgentResultStatus;
  finalText: string;
  steps: number;
  modelName: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}
```

### 10.3 AgentRuntime

```ts
export interface AgentRuntime {
  run(input: RuntimeInput): Promise<AgentResult>;
}
```

说明：

- `AgentResult` 是 UI 的最终消费对象。
- UI 不应该从 SessionStore 自己拼最终结果。

---

## 11. Phase 1 最小工具参数协议

### 11.1 `list_dir`

```ts
export interface ListDirArgs {
  path: string;
  depth?: number;
}
```

### 11.2 `read_file`

```ts
export interface ReadFileArgs {
  path: string;
  startLine?: number;
  endLine?: number;
}
```

### 11.3 `grep`

```ts
export interface GrepArgs {
  pattern: string;
  path?: string;
  include?: string;
}
```

### 11.4 `apply_patch`

```ts
export interface ApplyPatchArgs {
  patch: string;
}
```

### 11.5 `run_shell`

```ts
export interface RunShellArgs {
  command: string;
  timeoutMs?: number;
}
```

---

## 12. 协议演进规则

后续演进遵守以下规则：

1. 新增字段优先，不轻易改语义。
2. 厂商格式变化只允许影响 Provider 和 Normalizer。
3. 新工具类型只允许扩展 Tool Layer，不改 Runtime Loop。
4. 新 UI 只消费 `AgentResult` 和 Session，不绕过 Runtime。
5. 权限扩展只允许新增策略，不改变三态决策模型。

---

## 13. 与实现的关系

推荐实现顺序：

1. 先定义本文件中的 TypeScript 类型。
2. 再实现 Provider、Tool Registry、Permission Engine、Session Store。
3. 最后实现 Agent Loop 和 CLI。

如果实现中发现需要新增字段，应先回到本文件更新协议，再编码，不要在实现里偷偷分叉类型。
