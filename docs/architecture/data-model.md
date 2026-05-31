# 数据模型与状态机

> layer: **architecture / data**  
> audience: agent（改 shared 类型、kernel、RunState 时读）  
> 上级索引：[architecture/README.md](./README.md)

**包边界以 [core-boundary.md](./core-boundary.md) 为准。**

---

## 1. 数据模型架构

数据模型的事实来源是 `packages/shared/src/`。除 memory provider 等少量插件接口外，跨包共享的 runtime、session、tool、model、permission、event 类型都应优先定义在 `@code-mind/shared`；状态机行为、运行期 adapter 与副作用编排仍归属 `@code-mind/core`。

### 1.1 核心关系图

```text
UserTask + AgentProfile + ModelProvider
        │
        ▼
RuntimeInput
        │
        ▼
AgentSession ── messages[] ── InternalMessage ── toolCalls[] ── ToolCall
        │                         ▲                                │
        │                         │                                ▼
        ├── observations[] ───────┴────────────── ToolResult / Artifact
        │
        ├── SessionManifest  （session 索引、状态、预算、plan/execute 关系）
        ├── AgentEvent       （run/step/model/tool/approval/verification 事件流）
        └── AgentResult      （终止状态、effectiveStatus、summary、metadata）
```

### 1.2 任务、模式与会话

| 模型 | 文件 | 作用 |
|------|------|------|
| `AgentMode` | `packages/shared/src/agent-modes.ts` | 运行模式：`ask` / `plan` / `edit` / `agent`；同时定义 read / plan / write 工具可用模式集合。 |
| `UserTask` | `packages/shared/src/types.ts` | 一次用户任务的输入：文本、cwd、mode、模型选择、maxSteps、metadata。 |
| `AgentProfile` | `packages/shared/src/types.ts` | Agent 人设与默认工具/模型偏好。 |
| `AgentSession` | `packages/shared/src/types.ts` | 一次 session 的内存态：task、profile、modelName、messages、observations、metadata。 |
| `SessionManifest` | `packages/shared/src/types.ts` | session 的磁盘索引态：路径、状态、预算、修改文件、plan/execute session 关系。 |
| `RuntimeInput` | `packages/shared/src/types.ts` | `AgentLoopController.run()` 的输入契约：task/profile/model/eventBus/resume/sessionRoot/abort/approval hooks。 |
| `AgentResult` | `packages/shared/src/types.ts` | session 结果：真实终止状态、用户可见 `effectiveStatus`、finalText、summary、verification/rejection/预算等 metadata。 |

状态语义：

```text
SessionRuntimeStatus = idle | running | retrying | awaiting_approval | compacting
AgentResultStatus    = success | failed | incomplete | stopped_by_limit
                     | permission_denied | user_rejected | cancelled
SessionStatus        = SessionRuntimeStatus | AgentResultStatus
```

`result.status` 表示 loop 的事实终止原因；`result.effectiveStatus` 表示产品侧应展示和分支判断的结果。业务判断应使用 `getEffectiveResultStatus()` / `isAgentRunSuccessful()`。

### 1.3 消息、上下文与模型

| 模型 | 文件 | 作用 |
|------|------|------|
| `InternalMessage` | `packages/shared/src/types.ts` | 发送给模型的统一消息格式，支持 tool calls、toolCallId、reasoningContent。 |
| `ContextBuildInput` | `packages/shared/src/types.ts` | context 构建输入：session + task + profile。 |
| `ContextSnapshot` | `packages/shared/src/types.ts` | context 输出：messages、modelOptions、metadata。 |
| `ContextManager` | `packages/shared/src/types.ts` | context 构建与 observation 写入接口。 |
| `ModelRequest` | `packages/shared/src/types.ts` | provider chat/stream 的标准请求：messages、tools、responseFormat、temperature、maxTokens、metadata。 |
| `ModelResponse` | `packages/shared/src/types.ts` | provider 响应：text、toolCalls、finishReason、reasoningContent、usage、raw。 |
| `ModelProvider` | `packages/shared/src/types.ts` | 模型适配器接口：`chat()`、可选 `stream()` / `countTokens()`、`getCapabilities()`。 |
| `ModelCapabilities` | `packages/shared/src/types.ts` | 工具调用、JSON schema、vision、reasoning、streaming、上下文长度等能力声明。 |

context 的实际实现位于 `packages/context/src/context-manager.ts`，负责组合 system prompt、mode policy、permission summary、run facts、plan attachment、subagent block、compaction summary、项目规则和 memory 注入。

### 1.4 工具、权限与审批

| 模型 | 文件 | 作用 |
|------|------|------|
| `ToolSchema` | `packages/shared/src/types.ts` | 暴露给模型的工具 schema。 |
| `ToolCall` | `packages/shared/src/types.ts` | 模型请求调用的工具名、参数、riskLevel、raw。 |
| `ToolResult` | `packages/shared/src/types.ts` | 工具执行结果：success、output、data、error、exitCode、artifacts、metadata。 |
| `Artifact` | `packages/shared/src/types.ts` | 工具产物引用，如 diff、patch、blob。 |
| `Observation` | `packages/shared/src/types.ts` | `ToolCall + ToolResult + createdAt`，写回 session。 |
| `ToolContext` | `packages/shared/src/types.ts` | 工具执行上下文：sessionId、workspaceRoot、cwd、mode、abortSignal。 |
| `Tool` | `packages/shared/src/types.ts` | 工具实现接口：name、schema、riskLevel、availableInModes、execute。 |
| `PermissionRequest` | `packages/shared/src/types.ts` | 权限检查输入：toolCall、mode、workspaceRoot、plan/subagent 上下文。 |
| `PermissionDecision` | `packages/shared/src/types.ts` | 权限决策：`allow` / `ask` / `deny`。 |
| `PermissionDecisionRecord` | `packages/shared/src/types.ts` | 权限决策审计记录。 |
| `ApprovalRecord` | `packages/shared/src/types.ts` | 需要人工处理的审批记录：pending/approved/denied。 |

工具 schema 与执行由 `packages/execution/src/tools/` 和 `ToolRegistry` 管理；权限策略由 `packages/security/src/permissions/permission-engine.ts` 管理；CLI/HTTP 只提供审批交互，不定义策略。

### 1.5 计划、验证、工作区与回滚

| 模型 | 文件 | 作用 |
|------|------|------|
| `AgentPlan` | `packages/shared/src/types.ts` | plan-first 产物：summary、riskLevel、affectedFiles、steps、verification、rollback。 |
| `PlannedFileChange` | `packages/shared/src/types.ts` | 计划涉及的文件、动作、原因、风险级别。 |
| `PlanStep` | `packages/shared/src/types.ts` | 计划步骤及状态。 |
| `VerificationStep` | `packages/shared/src/types.ts` | 计划中的验证步骤。 |
| `RollbackPlan` | `packages/shared/src/types.ts` | 计划中的回滚说明。 |
| `VerificationResult` | `packages/shared/src/types.ts` | verification pipeline 输出，包含 steps 和 summary。 |
| `TestResult` | `packages/shared/src/types.ts` | 单条测试命令结果，包含 stdout/stderr、exitCode、失败摘要。 |
| `ReviewResult` | `packages/shared/src/types.ts` | review engine 输出：issues、suggestions、是否需要再次迭代。 |
| `WorktreeInfo` | `packages/shared/src/types.ts` | worktree 路径、分支、baseRef、创建时间。 |

快照、diff、patch、rollback 的文件产物不直接写在 shared 类型里，实际路径规则在 `packages/workspace/src/session-artifacts.ts`，读写实现分布在 `file-snapshot.ts`、`diff-manager.ts`、`rollback-manager.ts`、`session-rollback.ts`。

### 1.6 事件、扩展与记忆

| 模型 | 文件 | 作用 |
|------|------|------|
| `AgentEvent` | `packages/shared/src/agent-event.ts` | run 事件统一格式：id、ts、runId、sessionId、seq、kind、level、source、payload、refs。 |
| `AgentEventBus` | `packages/shared/src/agent-event.ts` | runtime 事件总线接口：emit、flush、finish、subscribe。 |
| `HookDefinition` / `HookInput` / `HookResult` | `packages/shared/src/types.ts` | hooks 的定义、输入和处理结果。 |
| `SkillDefinition` | `packages/shared/src/types.ts` | skill 元数据与内容。 |
| `SubagentDefinition` | `packages/shared/src/types.ts` | 子 agent 定义：role、model、mode、tools。 |
| `CommandDefinition` | `packages/shared/src/types.ts` | 自定义命令定义。 |
| `PluginDefinition` | `packages/shared/src/types.ts` | 插件定义：skills、agents、hooks、commands、permissions。 |
| `CapabilityManifest` | `packages/shared/src/types.ts` | 当前能力清单：models、tools、mcpServers、skills、subagents、hooks、commands、plugins。 |
| `MemoryProvider` | `packages/memory/src/memory-provider.interface.ts` | 记忆插件接口：capture、summarize、search、inject。 |

扩展系统的 **public owner** 为 `@code-mind/capabilities`（`packages/capabilities/src/`）。memory 默认实现是 `packages/memory/src/noop-memory-provider.ts`。

### 1.7 Run Kernel 状态模型

`RunKernelState` 是 agent loop 的核心状态事实，持久化形状定义在 `packages/shared/src/run-kernel-state.ts`，并随 `RunState` 持久化到 `run-state.json`；`packages/core/src/agent/kernel/state.ts` 负责 re-export 与构造 helper。它不执行副作用，只表达当前 loop 所处阶段、步数、预算、是否 closing turn、待处理工具数和是否需要 checkpoint。

```text
RunState
  ├── kernel: RunKernelState
  ├── progress: ProgressState
  ├── planMode: PlanModeState
  ├── exploration: ExplorationState
  ├── verification: VerificationState
  ├── review: ReviewState
  ├── budget: StepBudgetState
  └── usage: TokenUsageState
```

Kernel 的输入输出模型：

| 模型 | 文件 | 作用 |
|------|------|------|
| `RunKernelState` | `packages/shared/src/run-kernel-state.ts`（core re-export: `packages/core/src/agent/kernel/state.ts`） | loop 阶段（`RunKernelPhase`）：`initializing`、`assembling_prompt`、`calling_model`、`routing_model_response`、`handling_tools`、`awaiting_approval`、`executing_tool`、`verifying`、`recovering`、`finalizing`、`completed`、`cancelled`、`failed`。 |
| `RunKernelEvent` | `packages/core/src/agent/kernel/events.ts` | runtime 输入给 kernel 的事实事件：step started、prompt assembled、model response、tool handled、approval requested/resolved、recovery requested、run completed/cancelled/failed。 |
| `RunKernelCommand` | `packages/core/src/agent/kernel/commands.ts` | kernel 输出给 runtime 的命令：checkpoint、assemble prompt、call model、handle tool calls、complete/finalize。 |
| `RunKernelTransition` | `packages/core/src/agent/kernel/run-state-machine.ts` | 一次状态转换的结果：next state + commands。 |
| `RunKernelPorts` | `packages/core/src/agent/kernel/ports.ts` | kernel 与外部能力的接口边界：prompt/model/permission/tool/state/HITL/events/completion。 |

规则：kernel 是纯状态机；prompt 拼接、模型调用、权限审批、工具执行、session 保存都必须通过 runtime adapter 或外部包完成。

runtime adapter 的事实入口是 `packages/core/src/agent/runtime/kernel-runtime.ts`：

- `applyRunKernelEvent()`：只推进内存态。
- `applyRunKernelEventAndCheckpoint()`：推进内存态并在 command 要求 checkpoint 时保存 `run-state.json`。
- `expectRunKernelCommand()` / `isRunKernelCommand()`：集中处理 command 类型匹配，runtime 不应到处手写 ad hoc 判断。

恢复时不能直接信任磁盘上的 kernel checkpoint。`run-state-persistence.ts` 会对 v4 kernel 做归一化：非法 phase、step、maxSteps、pendingToolCalls 等字段会回退到由 progress/budget 推导出的安全状态；manifest 中的 `effectiveMaxSteps` 也会同步回 `budget.extraStepBudget` 与 `kernel.maxSteps`。

### 1.8 双层 FSM 与执行分层

为在 **架构稳定** 与 **可扩展** 之间取得平衡，loop 被刻意拆成两层状态机（见 [core-boundary.md](./core-boundary.md) 冻结契约与扩展规则）。

```text
┌─────────────────────────────────────────────────────────────┐
│  Controller FSM（步间 / 产品策略）                              │
│  AgentLoopController + task-strategy (LoopPolicy)           │
│  · step 预算：for (step < maxSteps)                          │
│  · closingTurn / stopped_by_limit / early terminal           │
│  · session init / completeRun / eventBus 生命周期             │
└───────────────────────────┬─────────────────────────────────┘
                            │ 每步调用 runAgentStep()
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Kernel FSM（步内 / 核心契约）                                │
│  RunKernelState.phase + RunKernelEvent → RunKernelCommand    │
│  · assembling_prompt → calling_model → handling_tools        │
│  · awaiting_approval / verifying / recovering / finalizing   │
│  · completed / cancelled / failed                          │
└─────────────────────────────────────────────────────────────┘
```

| 层 | 负责 | 扩展方式 | 变更频率 |
|----|------|----------|----------|
| **Kernel** | 单步内的 phase、invariant、checkpoint 语义 | 新增 `RunKernelEvent` / `RunKernelCommand` + 测试 | **低**（冻结契约） |
| **Controller** | 步间调度、maxSteps、`LoopPolicy`、run 生命周期 | `task-strategy.ts`、controller 终止分支 | **中** |
| **Runtime adapter** | 执行 command、副作用、持久化 | port adapter、`kernel-runtime.ts` | **中** |
| **Apps** | 默认实现选择与组合 | `runtime-deps.ts`、API 注入 | **高**（产品差异） |

**步内**决策（prompt / model / tool / approval / verify / finalize）必须映射到 kernel event；**步间**决策（是否进入下一步、是否因 step 上限停止）由 controller + `LoopPolicy` 负责，**不要求**对应 kernel command。

Run 执行分两阶段 wiring（目标形态，部分仍在演进）：

```text
Phase A  Run bootstrap
  session restore/create → runState → createRunScopedKernelPorts()

Phase B  Step execution
  createRunScopedStepRunner(runPorts, …) → runAgentStep()
  只消费 run-scoped RunKernelPorts + kernel-runtime adapter
```
