# 文件组织与扩展规则

> layer: **architecture / layout**  
> audience: agent（新增文件、工具、包、路由时读）  
> 上级索引：[architecture/README.md](./README.md)

**新增代码必须遵守 §2.6 归属规则与 §2.7 扩展规则；与 [core-boundary.md](./core-boundary.md) 冲突时以 core-boundary 为准。**

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
        compaction-port.ts      CompactionPort + createCompactionPort [Phase 1–2]
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
  compaction.ts              # window retain、阈值、applyCompaction [LLM-only]
  compaction-prompt.ts       # LLM merge 模板（无 HTTP）
  compaction-locale.ts       # zh/en merge locale
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
    glob.ts
    grep.ts
    apply-patch.ts
    write-file.ts
    search-replace.ts
    delete-file.ts
    move-file.ts
    file-write-helper.ts
    file-mutation-helper.ts
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

