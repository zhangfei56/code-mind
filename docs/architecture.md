# code-mind 架构

> scope: **data-model-and-files**  
> audience: agent, contributor  
> last updated: 2026-05-30（架构稳定性决策 §1.8、§2.7）  
> 本文只描述两件事：**数据模型架构** 与 **对应文件组织架构**。

**包归属与 public API 以 [core-boundary.md](./core-boundary.md) 为准**；`packages/core` 内 compat copy 已删除，下文文件树以当前源码为准。

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

---

## 2. 文件组织架构

### 2.1 顶层组织

```text
apps/                         用户入口与运行表面
  cli/                        code-mind CLI、REPL、TUI、命令分发、终端输出
  api-server/                 HTTP API、SSE/WS stream、approval/session/run routes
  ci/                         CI 入口说明

packages/                     可复用 runtime 包
  shared/                     跨包数据模型、错误、id、时间、patch parser、agent events
  core/                       agent loop、kernel、run-session、result 语义（不含已迁出实现的 public owner）
  capabilities/               skill、plugin、hook、subagent、command、capability manifest
  session/                    FileSessionStore、manifest、restore、revert、summary
  verify/                     verification、review、test-runner、verify profile
  server-runtime/             async run、HTTP tool/plan 审批队列
  context/                    prompt/context/compaction 构建
  models/                     provider adapters、normalizer、retry、model factory
  execution/                  tool registry/executor、builtin tools、MCP adapter、git/lsp/worktree services
  security/                   permission engine、file/shell/subagent rules、safety guard
  workspace/                  workspace path、project rules、session artifacts、snapshot/diff/rollback
  observability/              event bus、run context、run store、metrics/redaction/session index
  memory/                     memory provider 接口与 Noop 实现
  config/                     config schema、配置加载、模型默认值

docs/                         开发与产品文档
tests/                        仓库级测试入口
scripts/                      开发脚本与 mock display
```

### 2.2 `packages/shared`: 数据模型中心

```text
packages/shared/src/
  types.ts                    主要共享接口与状态枚举
  agent-modes.ts              AgentMode 与工具模式集合
  agent-event.ts              AgentEvent / AgentEventBus / event kinds
  activity.ts                 activity kind 与工具计数
  patch.ts                    patch parser 共享逻辑
  ids.ts                      id 生成
  time.ts                     时间工具
  errors.ts                   共享错误类型
  process-log.ts              process log 入口
  index.ts                    public exports
```

规则：如果一个类型会跨越两个以上包，优先放在 `shared`；如果只是某个包内部实现细节，保留在本包内。

### 2.3 `packages/core`: Agent runtime 编排

```text
packages/core/src/
  agent/
    run-session.ts            session 统一入口
    task-strategy.ts          mode policy / max steps / closing turn 策略
    result-builder.ts         AgentResult 构造
    result-status.ts          termination/effective status 语义
    plan-session-orchestrator.ts
    session-orchestration.ts
    session-store-factory.ts   L2 FileSessionStore -> SessionStorePort 默认工厂
    kernel/
      state.ts                 RunKernelState / RunKernelPhase
      events.ts                RunKernelEvent
      commands.ts              RunKernelCommand
      run-state-machine.ts     纯状态机
      invariants.ts            kernel 不变量
      ports.ts                 外部依赖边界接口
    runtime/
      runtime-wiring.ts          composition: deps -> AgentLoopRuntimeWiring
      agent-loop-controller.ts   thin loop controller (wiring only)
      step-runner.ts
      model-step.ts
      model-step-assembly.ts
      model-step-completion.ts
      tool-schema-selection.ts
      tool-call-handler.ts
      kernel-runtime.ts          kernel event -> state / checkpoint adapter
      run-state.ts
      run-state-persistence.ts
      session-init.ts
      session-lifecycle.ts
      session-status.ts
      finalize.ts
      permission.ts
      verification.ts          loop 内自动验证（非 @code-mind/verify 包本体）
      review-runtime.ts
      plan-mode.ts
      plan-artifact.ts
      agent-events.ts
      runtime-event-hub.ts       WebSocket / 流式 run 事件（API 订阅）
      default-runtime-deps.ts
      tool-call/
        authorization.ts
        lifecycle.ts
        subagent-events.ts
        types.ts
      ports/
        index.ts
        permission-port.ts
        human-approval-port.ts
        tool-execution-port.ts
        prompt-assembly-port.ts
        model-port.ts
        observation-port.ts
        verification-port.ts
        review-port.ts
        session-store-port.ts   纯 SessionStorePort 契约 + structural adapter
```

packages/agent-composition/src/
  compose-agent-loop.ts       composeAgentLoop（extensions + subagent + default deps）

Session / verify / capabilities / HTTP 审批的 **public owner** 分别为 `packages/session/`、`packages/verify/`、`packages/capabilities/`、`packages/server-runtime/`（不在 `packages/core` 内）。产品级 loop 组合见 `@code-mind/agent-composition`。

`core` 可以依赖 context/models/execution/security/workspace/observability/capabilities/session/verify 等 runtime owning packages，但 **不得依赖 `server-runtime`**；`server-runtime` 是 HTTP/async 组合层，依赖 `core`。除 `server-runtime` / `agent-composition` 等明确的组合包外，runtime owning packages 不应反向依赖 `core`。

### 2.3.1 `packages/capabilities` / `session` / `verify` / `server-runtime`

```text
packages/capabilities/src/
  skill-engine.ts
  plugin-manager.ts
  hook-system.ts
  subagent-manager.ts
  subagent-tool.ts
  subagent-builtin.ts
  loader.ts
  registry.ts
  capabilities.ts

packages/session/src/
  session-store.ts
  session-manifest.ts
  session-restore.ts
  session-revert.ts
  summary-writer.ts

packages/verify/src/
  verification.ts
  review-engine.ts
  test-runner.ts
  verify-profile.ts
  verification-options.ts

packages/server-runtime/src/
  async-run-manager.ts
  http-approval-queue.ts
  http-plan-approval-queue.ts
  plan-approval.ts
```

apps/cli 与 apps/api-server 应 **public import** 以上包；勿在 apps 层依赖 core compat 路径。

### 2.4 入口层文件

```text
apps/cli/src/
  cli/
    index.ts                  CLI 入口
    yargs-app.ts              命令树
    normalize-argv.ts
    common-options.ts
    runtime-deps.ts             createCliAgentLoop 封装
  commands/
    execute-cli-args.ts       run/session/verify/review 等命令执行
    sessions.ts
    runs.ts
    config.ts
    models.ts
  interactive/
    repl.ts
    cli-permission-prompter.ts
    approval-coordinator.ts
    plan-approval.ts
    session-views.ts
  tui/
    app.ts
    state.ts
    commands.ts
    presentation.ts
    context.ts
  ui/
    progress-printer.ts
    result-summary.ts
    agent-output/

apps/api-server/src/
  main.ts
  index.ts
  web-ui.ts
  http-utils.ts
  routes/
    run.routes.ts
    session.routes.ts
    approval.routes.ts
    plan-approval.routes.ts
    index.ts
```

入口层只应做参数解析、展示、HTTP 适配和审批交互；实际任务执行必须进入 `@code-mind/core`。

### 2.5 支撑包文件

```text
packages/context/src/
  context-manager.ts
  system-prompt.ts
  compaction.ts
  run-facts-block.ts
  plan-mode-attachment.ts
  subagent-delegation-block.ts

packages/models/src/
  model-router.ts
  normalizer.ts
  retry.ts
  stream-parser.ts
  adapters/
    openai-compatible.ts
    qwen.ts
    local.ts

packages/execution/src/
  tool-executor.ts
  tools/
    registry.ts
    default-tools.ts
    read-file.ts
    list-dir.ts
    grep.ts
    apply-patch.ts
    run-shell.ts
    git-tools.ts
    lsp-tools.ts
    worktree-tools.ts
  services/
    git-manager.ts
    lsp-adapter.ts
    typescript.ts
    worktree-manager.ts
  mcp/
    mcp-adapter.ts

packages/security/src/
  permissions/
    permission-engine.ts
    file-rules.ts
    shell-rules.ts
    subagent-permission.ts
  safety/
    safety-guard.ts

packages/workspace/src/
  resolve-workspace.ts
  sandbox-path.ts
  project-rules.ts
  session-artifacts.ts
  file-snapshot.ts
  diff-manager.ts
  rollback-manager.ts
  session-rollback.ts
  ignore.ts

packages/observability/src/
  event-bus.ts
  run-context.ts
  run-store.ts
  append-run-event.ts
  session-index.ts
  metrics-sink.ts
  redaction.ts
  event.ts
```

### 2.6 文件归属规则

- 新增跨包类型：放 `packages/shared/src/types.ts` 或更具体的 shared 文件，并从 `packages/shared/src/index.ts` 导出。
- 新增 kernel 状态/事件/命令/不变量：放 `packages/core/src/agent/kernel/`，保持纯函数和可单测。
- 新增 runtime loop 副作用：放 `packages/core/src/agent/runtime/`；如果要驱动 kernel，优先通过 `runtime/kernel-runtime.ts`。
- 新增跨 session 入口逻辑：放 `packages/core/src/agent/`。
- 新增 CLI 命令：命令解析放 `apps/cli/src/cli/`，执行分发放 `apps/cli/src/commands/`。
- 新增工具：tool 实现放 `packages/execution/src/tools/`，注册到 `default-tools.ts`；权限策略放 `packages/security/src/permissions/`。
- 新增 session 磁盘产物：路径规则放 `packages/workspace/src/session-artifacts.ts`；`FileSessionStore` / restore / revert 放 `packages/session/src/`。
- 新增模型 provider：adapter 放 `packages/models/src/adapters/`，选择逻辑放 `packages/models/src/model-router.ts`。
- 新增 context 内容：放 `packages/context/src/`，不要在 CLI/API 中拼 prompt。
- 新增扩展能力：实现放 `packages/capabilities/src/`；插件类型见 `@code-mind/shared`（`PluginDefinition`）。勿在 `packages/core` 内重建 extensions 目录。
- 新增 verification/review：放 `packages/verify/src/`。
- 新增 HTTP 审批 / 异步 run：放 `packages/server-runtime/src/`。
- 新增 guardrails（规划）：放 `packages/security/src/guardrails/`；MVP 由 PermissionEngine + SafetyGuard 覆盖。
- 新增 HTTP API：route 放 `apps/api-server/src/routes/`；不要在 route 中绕过 `runAgentSession`；session 经 `createOrchestrationSessionStore`（`SessionStorePort`），实现仍在 `@code-mind/session`。

### 2.7 扩展规则（三类插口）

新功能 **只允许** 通过以下三类插口扩展；禁止在 runtime 主路径新增第四类隐式分支。

| 类型 | 插口 | 示例 |
|------|------|------|
| **1. Port** | `RunKernelPorts` 及 `runtime/ports/*` adapter | 新审批 UI、新验证后端、新模型 invoke |
| **2. 包** | `@code-mind/capabilities` / `session` / `verify` / `execution` / `models` / `security` | 新工具、hook、skill、session 存储实现 |
| **3. Apps 组合** | `@code-mind/agent-composition`（`composeAgentLoop`）、CLI `runtime-deps.ts`、API overrides | 默认 wiring、环境差异、subagent 注册 |

| 需求 | 推荐路径 | 避免 |
|------|----------|------|
| 新工具 | `execution` 注册 + `security` 权限规则 | core 内写死工具 |
| 新模型 | `models` adapter + `ModelPort` | `model-step` 直连 provider |
| 新审批方式 | `HumanApprovalPort` + apps 注入 | CLI 分支写进 core |
| 新验证/审查 | `verify` + `VerificationPort` / `ReviewPort` | 复制 `verification.ts` |
| 新 session 存储 | `SessionStorePort` + `createSessionStorePort` | lifecycle / apps 直连 `FileSessionStore` 类型 |
| 新 run 阶段（步内） | 新 `RunKernelEvent` + transition + test | 只在 `step-runner` 加 if/else |
| 新终止策略（步间） | `LoopPolicy` / `task-strategy` | 扩展 kernel phase 枚举 |
| 新可观测性 | `observability` + `kernel.transition` event | 散落 debug log |

**Composition root 归属**：`loadExtensions`、subagent 注册、默认 `permissionPrompter` 合并由 **`@code-mind/agent-composition`** 的 `composeAgentLoop` 完成；CLI/API 只传 overrides。Core 提供 `createAgentLoopRuntimeWiring` / `createAgentLoopController` factory。
