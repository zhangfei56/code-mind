# Core Boundary

> layer: **architecture / core-boundary**  
> status: active  
> last updated: 2026-05-31  
> 上级索引：[README.md](./README.md)

本文固定 `packages/core` 的边界。判断标准：

```text
core = agent decision + loop contract + kernel runtime orchestration
external packages = concrete capability/session/verification/server implementations
apps = composition root
```

核心稳定化（kernel、ports、composition）已完成；双层 FSM 见 [data-model.md §1.8](./data-model.md#18-双层-fsm-与执行分层)。

## 1. Public Core API

`@code-mind/core` 导出按 **稳定性分层** 组织。对外集成优先依赖 L1；测试与 apps 组合可使用 L2；kernel 契约（L3）供高级集成，变更需配套测试。

### L1 — 产品 API（长期稳定，semver 严格）

- `runAgentSession`
- `executeFromApprovedPlan`
- `AgentLoopController`（类型 + `run()` 契约）
- result/status helpers（`getEffectiveResultStatus`、`isAgentRunSuccessful` 等）
- task strategy helpers（`createLoopPolicy`、`shouldEnterClosingTurn` 等）

### L2 — 组合 API（composition helper，文档标明用途）

- `composeAgentLoop` / `loadComposedToolRegistry` / `loadWorkspaceExtensions` — **`@code-mind/agent-composition`**（带工具 registry 或仅元数据；CLI 应经此包加载，避免直接 `loadExtensions`）
- `createAgentLoopController` / `createAgentLoopRuntimeWiring`
- `createDefaultRuntimeDependencies`（L2 便利工厂，可实例化 context/execution/security/session/verify 的默认实现；不代表这些实现归属 core）
- `buildRuntimePlan`（CLI / session lifecycle plan artifact）
- run-state serialization helpers（`serializeRunState`、`restoreRunStateForSession` 等）
- `createOrchestrationSessionStore`（plan-first / session 编排 / CLI session 命令；含 `getSessionDir` 等 HITL 与目录操作）
- plan-mode runtime helpers
- `RuntimeEventHub` / `runtimeEventHub`（`agent/runtime/runtime-event-hub.ts`）

### L3 — 内核契约（行为由测试锁定，可增不可轻易改名）

- kernel state / event / command / ports 类型
- `SessionStorePort` / `createSessionStorePort` / `createOrchestrationSessionStore`（runtime + 编排/HITL 持久化边界）
- `transitionRunKernelState`、`assertRunKernelInvariants` 等 kernel 导出
- `applyRunKernelEventAndCheckpoint`、`dispatchRunKernelCommands` 等 kernel-runtime adapter
- `createStaticRuntimePorts` / `createRunScopedKernelPorts` 及 port factory helpers
- `HumanApprovalPort` / `HumanApprovalPortAdapter`（含 `request` + `resolve`；`ApprovalFlowCallbacks` 在 kernel）
- `ObservationPort` / `VerificationPort` / `ReviewPort` 类型（adapter 在 runtime/ports）
- `CompactionPort`（Phase 1+；LLM 增量摘要 adapter，`@code-mind/context` 不得直接调 `ModelProvider`）
- runtime 测试面：`finalizeResult`、`resolvePermission`、`runAutomaticVerification`、`completeRun`、exploration-evidence helpers、plan-mode tool/schema helpers、常用 `agent-events` 工厂、`syncModifiedFilesFromWorkspace`

以下 **不再** 由 core 实现或导出（使用 owning package）：

- capabilities → `@code-mind/capabilities`
- verification 实现 → `@code-mind/verify`
- `FileSessionStore` 实现 / restore / revert → `@code-mind/session`（core 经 `SessionStorePort` / `createOrchestrationSessionStore`）
- async/http approval queues → `@code-mind/server-runtime`
- 产品组合 `composeAgentLoop` → `@code-mind/agent-composition`

## 2. Current File Classification

| Path | Classification | Target |
|------|----------------|--------|
| `agent/kernel/*` | keep | Pure kernel state machine（步内 FSM）。 |
| `agent/runtime/kernel-runtime.ts` | keep | Kernel event/checkpoint/command adapter。 |
| `agent/runtime/run-state.ts` | keep | Runtime state model。 |
| `agent/runtime/run-state-persistence.ts` | keep-refactor | Serializer 在 core；normalize 逻辑在 core；具体 store 在 `@code-mind/session`。 |
| `agent/runtime/step-runner.ts` | keep | 单步 orchestration；步间 loop 在 controller。 |
| `agent/runtime/model-step.ts` | keep-refactor | 单步 model 路径；assembly/completion 已拆分。 |
| `agent/runtime/model-step-assembly.ts` | keep | Prompt/capability assembly。 |
| `agent/runtime/model-step-completion.ts` | keep | Terminal text / summary retry。 |
| `agent/runtime/session-status.ts` | keep | Session manifest status updates。 |
| `agent/runtime/ports/unscoped-ports.ts` | removed | 已删；step runner 在 `createRunScopedKernelPorts` 之后由 `createRunScopedStepRunner` 构建。 |
| `agent/runtime/ports/observation-port.ts` | keep | `ObservationPort` adapter。 |
| `agent/runtime/ports/verification-port.ts` | keep | `VerificationPort` adapter。 |
| `agent/runtime/ports/review-port.ts` | keep | `ReviewPort` adapter。 |
| `agent/runtime/default-runtime-deps.ts` | keep | 默认依赖解析；apps 可 override。 |
| `agent/runtime/tool-schema-selection.ts` | keep | Structured tool schema selection。 |
| `agent/runtime/tool-call-handler.ts` | keep-refactor | Runtime adapter；执行走 ports。 |
| `agent/runtime/permission.ts` | keep-refactor | 审批流；策略在 `@code-mind/security`。 |
| `agent/runtime/session-lifecycle.ts` | keep | 经 `SessionStorePort` 持久化；`compactSessionIfNeeded` 编排 LLM Port → persist；失败 emit + debounce。 |
| `agent/runtime/ports/compaction-port.ts` | keep | `CompactionPort` 契约 + `createCompactionPort`（LLM-only，失败 throw）。 |
| `agent/runtime/ports/session-store-port.ts` | keep | `SessionStorePort` 契约 + `createSessionStorePort(FileSessionStore)` adapter。 |
| `agent/result-builder.ts` | keep | Core result construction。 |
| `agent/result-status.ts` | keep | Core result semantics。 |
| `agent/task-strategy.ts` | keep | 步间策略（LoopPolicy / maxSteps / closing turn）。 |
| `agent/run-session.ts` | keep | Main core entry。 |
| `agent/plan-session-orchestrator.ts` | keep | Plan-first orchestration。 |
| `agent/session-store-factory.ts` | keep | L2 `FileSessionStore` → `SessionStorePort` 默认工厂；L3 port 文件保持纯契约。 |
| `agent/runtime/runtime-wiring.ts` | keep | deps → `AgentLoopRuntimeWiring` factory。 |
| `agent/runtime/agent-loop-controller.ts` | keep | Thin controller；步间 FSM + `run()` 生命周期。 |
| `extensions/*` | removed | `@code-mind/capabilities` |
| `verify/*` | removed | `@code-mind/verify` |
| `session/*` | removed | `@code-mind/session` |

## 3. Package Ownership

```text
@code-mind/core
  agent/kernel          步内状态机契约
  agent/runtime         kernel adapter + loop orchestration
  agent result/status/strategy/session orchestration

@code-mind/capabilities
  skills, plugins, hooks, commands, subagents, capability manifest

@code-mind/verify
  verification pipeline, review engine, test runner, verify profile

@code-mind/session
  FileSessionStore, session manifest, restore/revert, summary writer

@code-mind/server-runtime
  async run manager, HTTP approval queues, plan approval handler
  depends on @code-mind/core; core must not depend on server-runtime

apps/*                  composition root（`composeAgentLoop`；入口必须 `runAgentSession`，勿 `loop.run` 绕过）

@code-mind/agent-composition
  composeAgentLoop        extensions + default deps + subagent tool（CLI/API 共用）
```

## 4. Frozen Contracts（稳定性）

以下内容在 **6–12 个月** 内优先 **只增不改名**； breaking change 需 migration + 全量测试 + 文档更新：

| 契约 | 说明 |
|------|------|
| `RunKernelEvent` / `RunKernelCommand` 命名 | 可新增类型；慎改已有名字 |
| `RunState` v4 磁盘形状 | 新字段走 v5 migration，不破坏 v4 读取 |
| `runAgentSession` 入参/出参语义 | L1 稳定面 |
| `getEffectiveResultStatus` 语义 | 产品分支依赖 |
| Checkpoint 规则 | approval / tool handled / terminal 必须经 `stateStore` port |
| 权限链顺序 | model → permission → safety → approval → hooks → executor |
| 双层 FSM 职责划分 | kernel=步内，controller=步间（见 [data-model.md §1.8](./data-model.md#18-双层-fsm-与执行分层)） |

## 5. Extension Rules

1. 新外部能力实现 **不得** 加入 `packages/core` 业务逻辑。
2. Runtime 需要外部能力时，**先** 扩展 port，再写 adapter。
3. 步内新阶段：**先** kernel event/command/invariant 测试，再改 runtime。
4. 步间新策略：改 `task-strategy` / controller，**不** 扩展 kernel phase 枚举（除非确有步内语义）。
5. Apps 是 composition root；勿在 CLI/API route 绕过 `runAgentSession`。
6. 扩展路径只允许三类：Port / 包 / Apps 组合（见 [file-layout.md §2.7](./file-layout.md#27-扩展规则三类插口)）。

## 6. Migration Rules

1. Core-internal compat copy 已删除；public import 必须用 owning package。
2. 进一步 runtime 去重：用 port 替换直连依赖，并证明全量测试通过。
3. `create-agent-loop.ts` 已删除；产品组合见 `@code-mind/agent-composition`。

## 7. Related docs

[principles.md](./principles.md)、[packages.md](./packages.md)、[data-model.md](./data-model.md)、[runtime/](./runtime/README.md)、[domains/subagent.md](./domains/subagent.md)、[../archive/completion-audit.md](../archive/completion-audit.md)。冲突时以本文为准。
