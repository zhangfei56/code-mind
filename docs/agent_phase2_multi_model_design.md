# 第二阶段：多模型与统一工具协议设计文档

> 阶段：Phase 2  
> 主题：Multi-Model Provider + Tool Call Normalizer  
> 技术栈：TypeScript / Node.js  
> 前置条件：阶段一 MVP 已完成  
> 阶段目标：从“单模型 Agent”升级为“多模型 Agent”，并保证不同模型输出都能被 Runtime 统一处理。

---

## 1. 阶段二目标

阶段一已经完成最小闭环：

```text
CLI 输入任务
  ↓
调用一个 OpenAI-compatible 模型
  ↓
模型发起工具调用
  ↓
执行 list_dir / read_file / grep / apply_patch / run_shell
  ↓
结果回填
  ↓
输出最终结果
```

阶段二的目标是：

> 在不破坏阶段一 Agent Loop 的前提下，抽象多模型接入层，并统一不同模型的工具调用格式。

阶段二完成后，系统应该支持：

```text
1. OpenAI Provider
2. Claude Provider
3. OpenAI-compatible Provider
4. Anthropic-compatible Provider
5. DeepSeek Provider
6. Qwen Provider
7. Ollama / vLLM / 本地模型 Provider
8. Custom Private Model Provider
9. Model Router
10. Fallback 策略
11. Tool Call Normalizer
12. Capability Profile
13. 多模型集成测试
```

---

## 2. 阶段二不做什么

阶段二不要扩展太多外围能力。

暂时不要做：

```text
1. MCP
2. Subagents
3. Skills
4. Hooks
5. Web UI
6. VS Code 插件
7. 企业权限
8. 复杂任务队列
9. 长期记忆系统
10. 成本后台统计系统
```

阶段二只解决一个核心问题：

> 不同模型如何接入同一个 Agent Runtime。

---

## 3. 阶段二完成后的效果

用户可以这样运行：

```bash
agent --model openai:gpt-5.5 "修复测试失败"
agent --model claude:sonnet "审查当前 diff"
agent --model deepseek:deepseek-chat "解释这个模块"
agent --model qwen:qwen-coder "补充单元测试"
agent --model local:qwen-coder "修复 TypeScript 类型错误"
```

也可以使用默认模型路由：

```bash
agent "修复测试失败"
```

系统根据任务类型自动选择模型：

```text
代码修复        → qwen-coder / gpt-5.5 / claude-sonnet
代码审查        → claude-sonnet / gpt-5.5
普通解释        → deepseek-chat / qwen-plus
长上下文分析    → claude-long-context / gpt-long-context
本地隐私任务    → local-qwen-coder
```

---

# 4. 阶段二总体架构

阶段二引入 `Model Layer` 和 `Normalizer Layer`。

```text
┌───────────────────────────────────────────────┐
│                 Agent Runtime                  │
│  Agent Loop / Tool Runtime / Permission Engine │
└──────────────────────┬────────────────────────┘
                       │
                       ▼
┌───────────────────────────────────────────────┐
│              Model Router                      │
│  任务类型 / 用户指定 / 成本 / 能力 / Fallback    │
└──────────────────────┬────────────────────────┘
                       │
                       ▼
┌───────────────────────────────────────────────┐
│              Model Provider Layer              │
│                                               │
│  OpenAIProvider                                │
│  ClaudeProvider                                │
│  OpenAICompatibleProvider                      │
│  AnthropicCompatibleProvider                   │
│  DeepSeekProvider                              │
│  QwenProvider                                  │
│  OllamaProvider                                │
│  VLLMProvider                                  │
│  CustomPrivateModelProvider                    │
└──────────────────────┬────────────────────────┘
                       │
                       ▼
┌───────────────────────────────────────────────┐
│            Tool Call Normalizer                │
│                                               │
│  OpenAI tool_calls  → Internal ToolCall         │
│  Claude tool_use    → Internal ToolCall         │
│  JSON Action        → Internal ToolCall         │
│  XML Action         → Internal ToolCall         │
│  Text Action        → Internal ToolCall         │
└──────────────────────┬────────────────────────┘
                       │
                       ▼
┌───────────────────────────────────────────────┐
│             Internal Model Response            │
│                                               │
│  text                                           │
│  toolCalls[]                                    │
│  usage                                          │
│  finishReason                                   │
│  raw                                            │
└───────────────────────────────────────────────┘
```

---

# 5. 核心原则

## 5.1 Runtime 不知道模型厂商

Agent Runtime 不能出现这种代码：

```ts
if (model === "openai") {
  // OpenAI-specific logic
}

if (model === "claude") {
  // Claude-specific logic
}
```

Runtime 只能依赖统一接口：

```ts
const response = await modelProvider.chat(request);

for (const toolCall of response.toolCalls) {
  await toolRuntime.execute(toolCall);
}
```

模型差异必须封装在 Provider 和 Normalizer 内部。

---

## 5.2 内部协议独立于任何厂商

不要让 OpenAI 格式成为系统内部标准，也不要让 Claude 格式成为系统内部标准。

正确方式：

```text
OpenAI Format
  ↓
OpenAIProvider
  ↓
Internal Format

Claude Format
  ↓
ClaudeProvider
  ↓
Internal Format

Qwen Format
  ↓
QwenProvider
  ↓
Internal Format
```

内部统一协议才是系统真正的稳定边界。

---

## 5.3 工具调用统一为 Internal ToolCall

无论模型怎么输出，最终必须统一成：

```ts
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  raw?: unknown;
}
```

Runtime 只认识这个格式。

---

## 5.4 模型能力必须显式声明

不同模型能力差别很大。

必须通过 `ModelCapabilities` 描述能力：

```ts
export interface ModelCapabilities {
  toolCall: boolean;
  parallelToolCall: boolean;
  jsonSchema: boolean;
  vision: boolean;
  reasoning: boolean;
  streaming: boolean;
  maxContextTokens: number;
  maxOutputTokens: number;
  supportsPromptCache: boolean;
  supportsSystemMessage: boolean;
  supportsDeveloperMessage: boolean;
  supportsComputerUse: boolean;
}
```

这样 Model Router 才能知道哪个模型适合哪个任务。

---

# 6. ModelProvider 抽象设计

## 6.1 Provider 接口

```ts
export interface ModelProvider {
  id: string;
  name: string;
  family: ModelFamily;

  chat(request: ModelRequest): Promise<ModelResponse>;

  stream?(request: ModelRequest): AsyncIterable<ModelStreamEvent>;

  countTokens?(input: ModelInput): Promise<TokenUsage>;

  getCapabilities(): ModelCapabilities;

  validateConfig(): Promise<void>;
}
```

---

## 6.2 ModelFamily

```ts
export type ModelFamily =
  | "openai"
  | "anthropic"
  | "openai-compatible"
  | "anthropic-compatible"
  | "deepseek"
  | "qwen"
  | "gemini"
  | "ollama"
  | "vllm"
  | "custom";
```

---

## 6.3 ModelRequest

```ts
export interface ModelRequest {
  model: string;
  messages: InternalMessage[];
  tools?: ToolSchema[];
  responseFormat?: ResponseFormat;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}
```

---

## 6.4 InternalMessage

```ts
export type InternalMessageRole =
  | "system"
  | "developer"
  | "user"
  | "assistant"
  | "tool";

export interface InternalMessage {
  role: InternalMessageRole;
  content: string | MessageContentPart[];
  name?: string;
  toolCallId?: string;
  metadata?: Record<string, unknown>;
}
```

阶段二必须注意：

不同模型对 message role 支持不同。

例如：

```text
OpenAI:
  支持 system / developer / user / assistant / tool

Claude:
  通常使用 system + user / assistant
  不一定原生支持 developer role
  tool result 格式不同

OpenAI-compatible:
  取决于具体服务实现

本地模型:
  可能只支持 user / assistant 文本
```

因此需要在 Provider 内部做 message 转换。

---

## 6.5 Message 转换规则

### OpenAIProvider

内部消息：

```text
system
developer
user
assistant
tool
```

转换为 OpenAI 请求时基本可以直接映射。

### ClaudeProvider

内部消息转换时：

```text
system + developer → 合并为 Claude system
user → user
assistant → assistant
tool → 转换为 Claude tool_result block
```

### Local / JSON Action Provider

如果本地模型不支持 tool schema，可以把工具定义转成文本提示词：

```text
你可以使用以下工具：

1. read_file
参数：
{
  "path": "string"
}

调用工具时必须输出：
{
  "action": "read_file",
  "arguments": {
    "path": "src/main.ts"
  }
}
```

---

# 7. ModelResponse 设计

```ts
export interface ModelResponse {
  text: string;
  toolCalls: ToolCall[];
  usage?: TokenUsage;
  finishReason: FinishReason;
  provider: string;
  model: string;
  raw: unknown;
}
```

---

## 7.1 FinishReason

```ts
export type FinishReason =
  | "stop"
  | "tool_call"
  | "length"
  | "content_filter"
  | "error"
  | "unknown";
```

---

## 7.2 TokenUsage

```ts
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  reasoningTokens?: number;
}
```

---

# 8. Tool Call Normalizer

## 8.1 目标

Tool Call Normalizer 负责把不同模型返回转换为内部统一格式。

```text
Provider Raw Response
       ↓
Provider Parser
       ↓
Tool Call Normalizer
       ↓
Internal ToolCall[]
```

---

## 8.2 Internal ToolCall

```ts
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  raw?: unknown;
}
```

---

## 8.3 OpenAI Tool Call 转换

OpenAI 风格：

```json
{
  "tool_calls": [
    {
      "id": "call_123",
      "type": "function",
      "function": {
        "name": "read_file",
        "arguments": "{\"path\":\"package.json\"}"
      }
    }
  ]
}
```

转换为：

```ts
{
  id: "call_123",
  name: "read_file",
  arguments: {
    path: "package.json"
  },
  raw: originalToolCall
}
```

---

## 8.4 Claude Tool Use 转换

Claude 风格：

```json
{
  "type": "tool_use",
  "id": "toolu_123",
  "name": "read_file",
  "input": {
    "path": "package.json"
  }
}
```

转换为：

```ts
{
  id: "toolu_123",
  name: "read_file",
  arguments: {
    path: "package.json"
  },
  raw: originalToolUseBlock
}
```

---

## 8.5 JSON Action 转换

某些本地模型可能输出：

```json
{
  "action": "read_file",
  "arguments": {
    "path": "package.json"
  }
}
```

转换为：

```ts
{
  id: "json_action_001",
  name: "read_file",
  arguments: {
    path: "package.json"
  },
  raw: originalJson
}
```

---

## 8.6 XML Action 转换

某些模型 JSON 不稳定，可以使用 XML：

```xml
<tool_call>
  <name>read_file</name>
  <arguments>
    {"path": "package.json"}
  </arguments>
</tool_call>
```

转换为：

```ts
{
  id: "xml_action_001",
  name: "read_file",
  arguments: {
    path: "package.json"
  },
  raw: originalText
}
```

---

## 8.7 Normalizer 错误处理

常见错误：

```text
1. arguments 不是合法 JSON
2. tool name 不存在
3. required 参数缺失
4. 参数类型错误
5. 模型输出多个冲突 action
6. 文本里混入解释和 JSON
```

处理策略：

```text
1. 尝试修复 JSON
2. 尝试从代码块中提取 JSON
3. 使用 zod / JSON Schema 校验参数
4. 校验失败时把错误作为 tool result 回填模型
5. 不能直接执行不合法工具调用
```

示例工具结果：

```json
{
  "success": false,
  "error": "Invalid tool arguments: read_file requires path:string"
}
```

---

# 9. Tool Schema 转换

内部工具 Schema：

```ts
export interface ToolSchema {
  name: string;
  description: string;
  parameters: JSONSchema;
}
```

---

## 9.1 转 OpenAI Tool Schema

```ts
function toOpenAIToolSchema(tool: ToolSchema) {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}
```

---

## 9.2 转 Claude Tool Schema

```ts
function toClaudeToolSchema(tool: ToolSchema) {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  };
}
```

---

## 9.3 转 Text Tool Description

给不支持原生 tool calling 的模型使用：

```text
可用工具：

工具名：read_file
描述：读取项目文件内容
参数：
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string"
    }
  },
  "required": ["path"]
}

调用格式：
{
  "action": "read_file",
  "arguments": {
    "path": "src/main.ts"
  }
}
```

---

# 10. Provider 实现范围

## 10.1 OpenAICompatibleProvider

### 用途

接入：

```text
OpenAI API
DeepSeek OpenAI-compatible
Qwen OpenAI-compatible
vLLM
LiteLLM
Ollama OpenAI-compatible
自研模型网关
```

### 请求路径

```text
POST /v1/chat/completions
```

### 必须支持

```text
messages
tools
tool_choice
temperature
max_tokens
stream: false
```

### 阶段二可暂不支持

```text
stream: true
response_format
vision
audio
reasoning
```

---

## 10.2 OpenAIProvider

如果使用 OpenAI 官方 SDK，可以单独封装。

但阶段二也可以先让 OpenAI 走 OpenAICompatibleProvider。

推荐策略：

```text
v0.2:
  OpenAI 先走 OpenAI-compatible

v0.3+:
  再实现 OpenAIProvider，支持 Responses API / structured outputs / prompt cache
```

---

## 10.3 ClaudeProvider

### 用途

接入 Anthropic 原生 Claude Messages API。

### 需要处理

```text
1. system message 单独提取
2. developer message 合并到 system
3. tools 转 Claude input_schema
4. tool_use 转 Internal ToolCall
5. tool_result 转 Claude message block
```

### Claude 请求转换示意

内部：

```ts
[
  { role: "system", content: "你是代码 Agent" },
  { role: "developer", content: "必须遵守项目规则" },
  { role: "user", content: "修复测试失败" }
]
```

转换为：

```ts
{
  system: "你是代码 Agent\n\n必须遵守项目规则",
  messages: [
    {
      role: "user",
      content: "修复测试失败"
    }
  ]
}
```

---

## 10.4 DeepSeekProvider

建议优先作为 OpenAI-compatible Provider 的一个配置，不必单独做复杂 Provider。

配置示例：

```yaml
models:
  deepseek-chat:
    provider: openai-compatible
    base_url: "https://api.deepseek.com/v1"
    api_key_env: "DEEPSEEK_API_KEY"
    model: "deepseek-chat"
```

如果后续 DeepSeek 特性需要单独适配，再扩展 `DeepSeekProvider`。

---

## 10.5 QwenProvider

同样建议优先走 OpenAI-compatible。

配置示例：

```yaml
models:
  qwen-coder:
    provider: openai-compatible
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1"
    api_key_env: "DASHSCOPE_API_KEY"
    model: "qwen-coder-plus"
```

---

## 10.6 OllamaProvider

Ollama 可通过 OpenAI-compatible 接口，也可以用 Ollama 原生 API。

阶段二建议先走 OpenAI-compatible。

配置示例：

```yaml
models:
  local-qwen:
    provider: openai-compatible
    base_url: "http://localhost:11434/v1"
    api_key: "ollama"
    model: "qwen2.5-coder"
```

---

## 10.7 CustomPrivateModelProvider

如果自研模型不支持 OpenAI-compatible，可以实现自定义 Provider。

建议支持两种输出协议：

```text
1. JSON Action
2. XML Tool Call
```

Provider 负责把模型输出解析为 Internal ToolCall。

---

# 11. Model Registry

## 11.1 作用

Model Registry 负责管理所有模型配置。

```text
Model Registry
├── 读取全局 config
├── 读取项目 config
├── 创建 Provider
├── 校验 Provider 配置
├── 查询模型能力
└── 提供给 Model Router 使用
```

---

## 11.2 配置文件

`~/.agent/config.yaml`

```yaml
default_model: qwen-coder
default_fallback:
  - qwen-coder
  - deepseek-chat
  - local-qwen

models:
  qwen-coder:
    provider: openai-compatible
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1"
    api_key_env: "DASHSCOPE_API_KEY"
    model: "qwen-coder-plus"
    capabilities:
      tool_call: true
      json_schema: false
      max_context_tokens: 128000

  deepseek-chat:
    provider: openai-compatible
    base_url: "https://api.deepseek.com/v1"
    api_key_env: "DEEPSEEK_API_KEY"
    model: "deepseek-chat"
    capabilities:
      tool_call: true
      json_schema: false
      max_context_tokens: 64000

  claude-sonnet:
    provider: claude
    api_key_env: "ANTHROPIC_API_KEY"
    model: "claude-sonnet"
    capabilities:
      tool_call: true
      json_schema: true
      max_context_tokens: 200000

  local-qwen:
    provider: openai-compatible
    base_url: "http://localhost:11434/v1"
    api_key: "ollama"
    model: "qwen2.5-coder"
    capabilities:
      tool_call: false
      json_schema: false
      max_context_tokens: 32768
      action_protocol: "json"
```

---

## 11.3 项目级覆盖

`.agent/settings.yaml`

```yaml
model:
  default: local-qwen
  fallback:
    - local-qwen
    - qwen-coder
    - deepseek-chat

privacy:
  local_only: true
```

如果 `privacy.local_only = true`，Model Router 不允许选择云模型。

---

# 12. Model Router

## 12.1 作用

Model Router 根据任务、配置、能力和用户参数选择模型。

输入：

```ts
export interface ModelRouteInput {
  requestedModel?: string;
  taskType?: TaskType;
  mode: RunMode;
  privacy?: PrivacyPolicy;
  estimatedContextTokens?: number;
  requiresToolCall?: boolean;
  requiresJsonSchema?: boolean;
}
```

输出：

```ts
export interface ModelRouteResult {
  primary: ModelProvider;
  fallbacks: ModelProvider[];
  reason: string;
}
```

---

## 12.2 路由优先级

```text
1. 用户命令行指定 --model
2. 项目级配置
3. 任务类型规则
4. 能力要求
5. 隐私策略
6. 全局默认模型
7. fallback 列表
```

---

## 12.3 路由规则示例

```yaml
model_router:
  rules:
    - name: code-review
      when:
        task_type: code_review
      prefer:
        - claude-sonnet
        - gpt-5.5
        - qwen-coder

    - name: local-privacy
      when:
        privacy: local_only
      prefer:
        - local-qwen
        - local-deepseek

    - name: long-context
      when:
        estimated_context_tokens_gt: 100000
      prefer:
        - claude-sonnet
        - gpt-long-context

    - name: cheap-summary
      when:
        task_type: explain_code
      prefer:
        - deepseek-chat
        - qwen-plus
```

---

# 13. Fallback 策略

## 13.1 需要 Fallback 的情况

```text
1. 模型 API 请求失败
2. 模型超时
3. 模型返回 429 / 5xx
4. 模型不支持工具调用
5. 模型输出工具调用格式错误
6. 模型上下文超限
7. 模型被隐私策略禁止
```

---

## 13.2 Fallback 流程

```text
调用 Primary Model
        ↓
失败？
        ↓
Retry 一次
        ↓
仍失败？
        ↓
切换 Fallback Model
        ↓
重新构造适合目标模型的上下文
        ↓
继续 Agent Loop
```

---

## 13.3 Fallback 注意事项

切换模型时必须注意：

```text
1. 不同模型 message 格式不同
2. 不同模型工具协议不同
3. 上一个模型产生的 tool_call 不能直接给下一个模型
4. 需要把历史压缩为统一文本/内部消息
5. 需要保留已执行工具结果
```

推荐做法：

```text
Fallback 时不复用 raw provider messages
只复用 InternalMessage 和 ToolResult Summary
```

---

# 14. 本地模型适配策略

很多本地模型不稳定支持 function calling。

因此需要支持两种运行方式：

```text
1. Native Tool Calling
2. Text Action Protocol
```

---

## 14.1 Native Tool Calling

模型支持 OpenAI tools 时，按正常流程走。

---

## 14.2 Text Action Protocol

如果模型不支持 tools，把工具说明写进 Prompt。

模型必须输出：

```json
{
  "action": "read_file",
  "arguments": {
    "path": "src/main.ts"
  }
}
```

或者最终答案：

```json
{
  "final": "问题出在 src/main.ts 第 10 行。"
}
```

---

## 14.3 推荐 Prompt

```text
你是一个代码 Agent。

你不能直接访问文件系统。
你只能通过工具请求操作。

可用工具：
{{tools}}

如果你要调用工具，只能输出 JSON：

{
  "action": "工具名",
  "arguments": {}
}

如果任务完成，只能输出 JSON：

{
  "final": "你的最终回答"
}

不要输出其他格式。
```

---

## 14.4 Text Action 解析策略

```text
1. 优先解析整个输出为 JSON
2. 如果失败，提取 ```json 代码块
3. 如果仍失败，提取第一个 {...}
4. 校验 action/final
5. 校验工具参数
6. 失败则要求模型重新输出合法 JSON
```

---

# 15. 流式输出设计

阶段二可选做，不是必须。

如果做，统一事件类型：

```ts
export type ModelStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call_start"; id: string; name: string }
  | { type: "tool_call_delta"; id: string; delta: string }
  | { type: "tool_call_done"; toolCall: ToolCall }
  | { type: "usage"; usage: TokenUsage }
  | { type: "done" }
  | { type: "error"; error: string };
```

阶段二推荐：

```text
先不做 stream。
等多模型非流式稳定后，再做 stream。
```

---

# 16. 错误类型设计

## 16.1 ModelError

```ts
export class ModelError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly model: string,
    public readonly code?: string,
    public readonly statusCode?: number,
    public readonly retryable?: boolean,
  ) {
    super(message);
  }
}
```

---

## 16.2 ToolCallParseError

```ts
export class ToolCallParseError extends Error {
  constructor(
    message: string,
    public readonly rawOutput: unknown,
  ) {
    super(message);
  }
}
```

---

## 16.3 CapabilityError

```ts
export class CapabilityError extends Error {
  constructor(
    message: string,
    public readonly requiredCapability: string,
    public readonly model: string,
  ) {
    super(message);
  }
}
```

---

# 17. 日志与审计

阶段二需要增强模型调用日志。

每次模型调用记录：

```text
1. provider
2. model
3. request messages 摘要
4. tools schema 摘要
5. raw response
6. normalized response
7. token usage
8. latency
9. error
10. fallback 信息
```

Session 目录：

```text
.agent/sessions/<session-id>/
├── messages.jsonl
├── model-calls.jsonl
├── tool-calls.jsonl
├── tool-results.jsonl
├── normalizer-errors.jsonl
├── fallback-events.jsonl
└── summary.md
```

`model-calls.jsonl` 示例：

```json
{
  "timestamp": "2026-01-01T00:00:00.000Z",
  "provider": "openai-compatible",
  "model": "qwen-coder",
  "latency_ms": 1200,
  "input_tokens": 3200,
  "output_tokens": 600,
  "finish_reason": "tool_call"
}
```

---

# 18. 阶段二开发任务拆分

## Task 1：重构阶段一 ModelProvider

### 需要完成

将阶段一写死的单模型调用重构为：

```text
ModelProvider interface
OpenAICompatibleProvider implementation
ModelRegistry
```

### 验证

原阶段一 demo 仍然可以跑通。

---

## Task 2：定义 Internal Model Protocol

### 需要完成

定义：

```text
InternalMessage
ModelRequest
ModelResponse
ToolCall
ToolSchema
TokenUsage
ModelCapabilities
FinishReason
```

### 验证

单元测试覆盖类型转换。

---

## Task 3：实现 OpenAICompatibleProvider

### 需要完成

支持：

```text
messages 转换
tools 转换
tool_calls 解析
usage 解析
错误处理
timeout
```

### 验证

用 mock server 返回 OpenAI 格式 tool_calls，确认能转换为 Internal ToolCall。

---

## Task 4：实现 ToolCallNormalizer

### 需要完成

支持：

```text
OpenAI tool_calls
Claude tool_use
JSON Action
XML Action
```

### 验证

分别输入 4 种格式，输出统一 ToolCall。

---

## Task 5：实现 Text Action Protocol

### 需要完成

给不支持 tools 的模型使用文本工具协议。

支持：

```text
action JSON
final JSON
JSON code block
混合文本里的 JSON 提取
```

### 验证

本地 mock 模型返回：

```json
{
  "action": "read_file",
  "arguments": {
    "path": "package.json"
  }
}
```

Runtime 能调用 read_file。

---

## Task 6：实现 ClaudeProvider

### 需要完成

支持：

```text
system/developer 合并
tools 转 input_schema
tool_use 解析
tool_result 消息转换
usage 解析
```

### 验证

使用 mock Claude response 或真实 Claude API，模型能调用 `read_file`。

---

## Task 7：实现 ModelRegistry

### 需要完成

读取配置：

```text
~/.agent/config.yaml
.agent/settings.yaml
```

创建对应 Provider。

### 验证

`agent models list` 能显示所有模型。

---

## Task 8：实现 ModelRouter

### 需要完成

支持：

```text
--model 指定模型
默认模型
项目级模型
fallback 列表
privacy.local_only
requiresToolCall
maxContextTokens 检查
```

### 验证

不同输入返回正确模型。

---

## Task 9：实现 Fallback

### 需要完成

支持：

```text
primary 调用失败后 retry
retry 失败后切换 fallback
记录 fallback event
```

### 验证

mock primary 返回 500，fallback 成功。

---

## Task 10：增强日志

### 需要完成

新增：

```text
model-calls.jsonl
normalizer-errors.jsonl
fallback-events.jsonl
```

### 验证

运行多模型任务后日志完整。

---

# 19. 阶段二测试用例

## 19.1 OpenAI tool_calls 解析

### 输入

```json
{
  "choices": [
    {
      "message": {
        "tool_calls": [
          {
            "id": "call_1",
            "type": "function",
            "function": {
              "name": "read_file",
              "arguments": "{\"path\":\"package.json\"}"
            }
          }
        ]
      }
    }
  ]
}
```

### 期望

```ts
{
  id: "call_1",
  name: "read_file",
  arguments: {
    path: "package.json"
  }
}
```

---

## 19.2 Claude tool_use 解析

### 输入

```json
{
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_1",
      "name": "read_file",
      "input": {
        "path": "package.json"
      }
    }
  ]
}
```

### 期望

```ts
{
  id: "toolu_1",
  name: "read_file",
  arguments: {
    path: "package.json"
  }
}
```

---

## 19.3 JSON Action 解析

### 输入

```json
{
  "action": "grep",
  "arguments": {
    "pattern": "add",
    "path": "."
  }
}
```

### 期望

```ts
{
  name: "grep",
  arguments: {
    pattern: "add",
    path: "."
  }
}
```

---

## 19.4 JSON Code Block 解析

### 输入

````markdown
我需要先读取文件。

```json
{
  "action": "read_file",
  "arguments": {
    "path": "src/math.ts"
  }
}
```
````

### 期望

```ts
{
  name: "read_file",
  arguments: {
    path: "src/math.ts"
  }
}
```

---

## 19.5 非法 JSON 修复失败

### 输入

```text
{"action": "read_file", "arguments": {"path": }}
```

### 期望

```text
ToolCallParseError
```

并将错误作为 observation 回填模型。

---

## 19.6 缺少必填参数

### 输入

```json
{
  "action": "read_file",
  "arguments": {}
}
```

### 期望

```text
Invalid tool arguments: path is required
```

---

## 19.7 ModelRouter 用户指定优先

### 输入

```bash
agent --model claude-sonnet "审查代码"
```

### 期望

```text
选择 claude-sonnet
```

---

## 19.8 Privacy local_only

### 配置

```yaml
privacy:
  local_only: true
```

### 输入

```bash
agent "修复测试失败"
```

### 期望

```text
只能选择 local-* 模型。
不能选择 OpenAI / Claude / DeepSeek 云模型。
```

---

## 19.9 Fallback 测试

### 场景

```text
primary: qwen-coder 返回 500
fallback: deepseek-chat 正常
```

### 期望

```text
1. 记录 primary 失败
2. 切换 fallback
3. 任务继续执行
4. fallback-events.jsonl 有记录
```

---

## 19.10 不支持 tool_call 的模型

### 配置

```yaml
local-qwen:
  capabilities:
    tool_call: false
    action_protocol: json
```

### 期望

```text
系统使用 Text Action Protocol。
不会传 tools 字段。
模型输出 JSON action 后仍能执行工具。
```

---

# 20. 阶段二集成测试

## 20.1 同一任务不同模型执行

测试命令：

```bash
agent --model qwen-coder "解释这个项目"
agent --model deepseek-chat "解释这个项目"
agent --model claude-sonnet "解释这个项目"
agent --model local-qwen "解释这个项目"
```

期望：

```text
四个模型都能完成只读分析任务。
```

---

## 20.2 同一 Bug 修复任务不同模型执行

测试命令：

```bash
agent --model qwen-coder "修复测试失败"
agent --model claude-sonnet "修复测试失败"
agent --model local-qwen "修复测试失败"
```

期望：

```text
至少 2 个模型可以完成修复。
不能完成的模型应给出明确失败原因，而不是破坏文件。
```

---

## 20.3 Fallback 集成测试

模拟 primary 不可用：

```bash
agent --model broken-model "解释这个项目"
```

期望：

```text
自动切换 fallback 模型。
```

---

## 20.4 本地模型 JSON Action 测试

使用 mock local model：

第一轮返回：

```json
{
  "action": "list_dir",
  "arguments": {
    "path": "."
  }
}
```

第二轮返回：

```json
{
  "final": "这是一个 TypeScript 项目。"
}
```

期望：

```text
Agent Loop 正常完成。
```

---

# 21. 阶段二验收标准

## 21.1 必须满足

```text
1. 原阶段一 demo 继续可用
2. 支持 ModelProvider 抽象
3. 支持 OpenAI-compatible Provider
4. 支持 ClaudeProvider 或至少完成 mock ClaudeProvider
5. 支持 JSON Action 本地模型协议
6. 支持 Tool Call Normalizer
7. 支持 ModelRegistry
8. 支持 --model 指定模型
9. 支持默认模型配置
10. 支持 fallback
11. 支持 model-calls 日志
12. 支持 capabilities 判断
```

---

## 21.2 可以暂时不满足

```text
1. 完整流式输出
2. 完整成本统计
3. Prompt Cache
4. JSON Schema 严格输出
5. Vision
6. Audio
7. Realtime
8. Computer Use
9. 多 Agent 协作
10. MCP
```

---

# 22. 推荐开发顺序

```text
1. 重构阶段一 ModelProvider
2. 定义 Internal Model Protocol
3. 实现 OpenAICompatibleProvider
4. 实现 ToolCallNormalizer
5. 实现 JSON Action Protocol
6. 实现 ModelRegistry
7. 实现 --model 参数
8. 实现 ModelRouter 简版
9. 实现 Fallback
10. 实现 ClaudeProvider
11. 增强日志
12. 编写 mock model 测试
13. 编写多模型集成测试
```

---

# 23. 阶段二风险点

## 23.1 模型 tool calling 能力差异

有些模型即使声称支持 function calling，也可能参数不稳定。

解决：

```text
1. 参数 schema 校验
2. 失败回填模型
3. 支持 Text Action Protocol
4. 支持模型能力标记
```

---

## 23.2 Claude / OpenAI Message 结构不同

解决：

```text
Provider 内部做 message adapter。
Runtime 不感知差异。
```

---

## 23.3 本地模型 JSON 不稳定

解决：

```text
1. 使用严格 prompt
2. 提取 JSON code block
3. 增加 retry
4. 解析失败后要求模型重新输出
```

---

## 23.4 Fallback 后上下文污染

解决：

```text
Fallback 时只使用 InternalMessage，不使用原厂 raw message。
工具结果统一摘要化。
```

---

## 23.5 多模型导致调试困难

解决：

```text
每次模型调用都记录：
provider
model
input 摘要
raw response
normalized response
latency
usage
error
```

---

# 24. 阶段二最终总结

阶段二的核心价值是：

> 把阶段一的单模型 Agent，升级为模型无关的 Agent Runtime。

完成阶段二后，系统应该具备以下能力：

```text
1. Runtime 不绑定任何模型厂商
2. 多模型通过 Provider 插件接入
3. 不同工具调用格式统一为 Internal ToolCall
4. 本地模型即使不支持 function calling，也能通过 JSON Action 使用工具
5. Model Router 可以根据任务、配置、能力选择模型
6. Fallback 可以在模型失败时自动切换
7. 日志可以清楚记录每一次模型调用和格式转换
```

一句话总结：

> 第二阶段的目标不是让 Agent 更聪明，而是让 Agent Runtime 从架构上摆脱单模型绑定，为后续多模型、私有模型、本地模型和企业模型网关接入打好基础。
