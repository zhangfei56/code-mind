# code-mind 实现现状与 MVP

> scope: **implementation-status**  
> audience: agent, contributor  
> last updated: 2026-05-30  
> 改代码、排期、评审前**优先读本文**。

相关文档：[core-boundary.md](./core-boundary.md)（包归属 / public API）· [architecture.md](./architecture.md)（数据模型、双层 FSM §1.8）

**包归属以 [core-boundary.md](./core-boundary.md) 为准。** 2026-05-30 起 `packages/core` 内 compat copy 已删除；runtime 通过 `@code-mind/capabilities` / `@code-mind/session` / `@code-mind/verify` public import。

---

## 1. MVP 范围

第一版只做 **code agent 闭环**，不要按全量架构一次性实现。

### 1.1 MVP 链路

```text
CLI / API (explicit AgentMode: ask | plan | edit | agent)
 ↓
runAgentSession（可选 plan-first、worktree、resume）
 ↓
AgentLoopController + LoopPolicy（task-strategy）
 ↓
Prompt / Context
 ↓
Model Provider
 ↓
PermissionEngine + SafetyGuard + Approval（CLI / HTTP）
 ↓
Tool Executor（mode-gated schemas）
 ↓
File / Search / Patch / Shell / Git / Test
 ↓
VerificationPipeline（edit/agent 自动验证 + recovery）
 ↓
finalize + ResultBuilder（status / effectiveStatus / completion）
```

### 1.2 MVP 功能

| # | 能力 | 状态 |
|---|------|------|
| 1 | 读取项目文件 | **已有** |
| 2 | 搜索代码 | **已有** |
| 3 | 生成修改计划 | **已有**（`mode=plan` 或 `--plan-first` 走 LLM + `runAgentSession`） |
| 4 | 应用 patch | **已有** |
| 5 | 运行测试 | **已有**（`VerificationPipeline` + edit/agent 自动验证） |
| 6 | 展示 diff | **部分**（审批 UI / patch preview；session diff 经 API） |
| 7 | 支持回滚 | **已有**（`code-mind sessions revert` + `POST /api/sessions/:id/revert`） |
| 8 | 输出修改说明 | **已有**（`AgentResult.finalText` + completion 分类） |

### 1.3 MVP 最小包集

```text
@code-mind/shared, config, models, context, execution, workspace, security, core
@code-mind/capabilities, session, verify, server-runtime
apps/cli, apps/api-server
```

MVP 已包含：`apps/cli` + 薄 `apps/api-server`（`POST /api/runs`、session 列表/详情、approval HTTP、内嵌 HTML）。CLI/API 的 session、verify、HTTP 审批等已直接依赖独立包；`core` 内 compat copy 已删除，见 [core-boundary.md](./core-boundary.md)。

### 1.4 MVP 可暂缓

```text
独立 Web App（apps/web）
Desktop App
Control Plane 完整能力（WebSocket 流式事件已实现；plan 审批 gate 已实现）
Plan / Execute 分 session（已实现）
复杂多 Agent / Workflow Engine
知识图谱 / 向量记忆
长期异步任务队列
云端 Sandbox（E2B / Daytona）
插件市场
Code Intelligence 全量（调用图、依赖图）
```

### 1.5 已知缺口（下一批优先）

Core runtime 加固（2026-05）已落地：

| 项 | 状态 |
|----|------|
| Resume RunState（verification / modifiedFiles / budget） | **已有** `run-state.json` + `restoreRunStateForSession` |
| Verification 空命令不算 pass | **已有** |
| 无 prompter → `permission_denied` | **已有** |
| Plan-first 默认需显式审批（`autoApprovePlan` / `approvePlan`） | **已有** |
| Abort 打断 tool/plan 审批等待 | **已有** |
| Verification 失败时不 force summary | **已有** |
| 空 final text → 重试 + `incomplete` status | **已有** |

后续可选增强：

| 优先级 | 项 | 说明 |
|--------|-----|------|
| — | CLI 使用教程 | **已有** [cli-guide.md](./cli-guide.md) |
| P3 | Web UI plan 审批面板 | HTTP API 已有；内嵌 HTML 可补 plan-approval UI |
| P3 | e2e 测试 | 有 integration；缺真实模型 e2e |
| P3 | Plan artifact 结构化解析 | `buildRuntimePlan` 仍为单步占位 |
| P3 | ReviewEngine 接入主 loop | **done** — `ReviewPort` + `tryReviewRecoveryBeforeCompletion` 在 model-step 终局路径 |
| P3 | Sub-agent spec 落地 | **已有** [subagent-policy.md](./subagent-policy.md)；权限/prompt/事件已实现 |

---

## 2. 逻辑层 → Package 映射

| 逻辑层 | Package | Public owner 路径 | 说明 |
|--------|---------|-------------------|------|
| Agent Orchestration | `@code-mind/core` | `agent/run-session.ts`, `agent/runtime/*`, `agent/kernel/*`, `task-strategy`, `result-builder`, `result-status` | 统一入口 `runAgentSession`；不含已迁出的 capabilities/verify/session 实现 |
| Capabilities | `@code-mind/capabilities` | `skill-engine`, `plugin-manager`, `hook-system`, `subagent-*`, `loader` | |
| Session 持久化 | `@code-mind/session` | `session-store`, `session-restore`, `session-revert`, `session-manifest` | |
| Verification | `@code-mind/verify` | `verification`, `review-engine`, `test-runner`, `verify-profile` | runtime 自动验证仍在 `core/agent/runtime/verification.ts` |
| Server runtime | `@code-mind/server-runtime` | `async-run-manager`, `http-approval-queue`, `http-plan-approval-queue` | |
| Context | `@code-mind/context` | `context-manager`, `compaction`, `system-prompt` | |
| Model | `@code-mind/models` | `model-router`, `adapters/*`, `normalizer`, `retry` | |
| Execution | `@code-mind/execution` | `tools/*`, `mcp/mcp-adapter` | 不含 sandbox 实现 |
| Workspace | `@code-mind/workspace` | `resolve`, `ignore`, `rules`, `session-artifacts`, `file-snapshot`, `diff-manager`, `rollback-manager` | CLI/API revert 已接入 |
| Security | `@code-mind/security` | `permissions/*`, `safety/*` | 审批策略在此；UI 在 `apps/cli/interactive`；HTTP 队列在 `@code-mind/server-runtime` |
| Config | `@code-mind/config` | `load-config`, `schema` | 用户 YAML（`~/.config/code-mind/config.yaml` 或 `--config`） |
| Shared | `@code-mind/shared` | `types`, `errors`, `patch`, `agent-event`, … | 跨包数据模型中心 |
| Observability | `@code-mind/observability` | `event-bus`, `run-store`, `run-context`, `redaction`, `metrics-sink` | **partial**；无 replay-engine；run 流式事件另见 `core` 的 `runtime/runtime-event-hub` |
| Memory | `@code-mind/memory` | interface + noop | |
| View | `apps/cli`, `apps/api-server` | CLI + 薄 HTTP | 无 `apps/web` |

---

## 3. 实现状态矩阵

| Package / App | 状态 | 说明 |
|---------------|------|------|
| shared | **production** | types, errors, ids, logger, patch |
| config | **production** | load-config, schema |
| models | **production** | model-router、adapters、normalizer、retry |
| context | **production** | compaction、context-manager、system-prompt |
| execution | **production** | 默认工具集、registry、MCP adapter |
| workspace | **partial** | resolve、ignore、rules、snapshot/diff/rollback；CLI/API revert 已接入 |
| security | **production** | permission-engine、safety-guard |
| core | **production** | `AgentLoopController`、`runAgentSession`、kernel/runtime |
| capabilities | **production** | skill/plugin/hook/subagent/command；apps/cli 已 public import |
| session | **production** | `FileSessionStore`、restore/revert；apps 经 `createOrchestrationSessionStore`（core L2 port） |
| verify | **production** | `VerificationPipeline`、`ReviewEngine`；CLI 已 public import |
| server-runtime | **production** | 异步 run、HTTP tool/plan 审批队列；api-server 已 public import |
| observability | **partial** | event-bus、run-store、redaction；无 replay-engine / 完整 cost trace |
| apps/cli | **production** | `cli/` 入口、`commands/` 分发、`ui/` 渲染、`interactive/` REPL + `ApprovalCoordinator` |
| apps/api-server | **partial** | 异步 run、WebSocket 流式、plan/tool 审批 HTTP；内嵌 Web UI 可扩展 |
| memory | **stub** | `NoopMemoryProvider` + 接口 |

**状态含义**：**production** = MVP 可依赖；**partial** = 有实现但不全；**stub** = 仅接口/占位。

---

## 4. 依赖与扩展原则

1. **副作用唯一入口**：模型不直接碰 FS/shell/git；经 `core` runtime → `execution`。
2. **包依赖无环**：`packages/*` 不得依赖 `apps/*`；`execution` 不依赖 `core`。
3. **插件优先**：记忆、沙箱、外部 MCP 走 `plugins/`，不写死进 core。
4. **先闭环再拆文件**：优先保证 MVP 链路可跑；新模块路径以源码与 [core-boundary.md](./core-boundary.md) 为准。

---

## 5. 模块归属（避免重复实现）

| 逻辑模块 | Public owner | 禁止 |
|----------|--------------|------|
| Repo Map Builder | `@code-mind/context` **[planned]** | 独立第二份 repo-map 实现 |
| AGENTS.md / CLAUDE.md 加载 | `@code-mind/workspace/project-rules` | 在 context 建 agents-loader |
| Sandbox Runtime | `plugins/` + `@code-mind/execution` **[planned]** | 在 execution 内嵌 E2B/Docker 前走插件 |
| Skill / plugin / hook / subagent | `@code-mind/capabilities` | 不在 context 重复；勿在 `packages/core` 内新增 extensions 实现 |
| Mode 策略 / 探索预算 | `@code-mind/core/agent/task-strategy` | 不做 prompt 关键词任务分类；无 `EngineeringOrchestrator` |
| Session 统一入口 | `@code-mind/core/agent/run-session.ts` | plan-first 为 plan/execute **分 session** + manifest 链接 |
| Plan 审批（HTTP） | `@code-mind/server-runtime`（`http-plan-approval-queue`） | `GET/POST /api/sessions/:id/plan-approval` |
| Sub-agent 策略 | [subagent-policy.md](./subagent-policy.md) + `@code-mind/capabilities` | `SubagentManager` + `run_subagent`；见 spec §11 |
| 流式事件 | `@code-mind/core/agent/runtime/runtime-event-hub.ts` | `ws://host/ws/runs/:runId` |
| 结果语义 | `@code-mind/core/agent/result-status.ts` | `status` 为事实终止态；`effectiveStatus` 供 CLI exit code |
| Session 持久化 | `SessionStorePort`（core）→ `@code-mind/session` | 勿在 core 新增 store 实现；adapter 内包装 `FileSessionStore` |
| Verification pipeline | `@code-mind/verify` | 勿在 core 新增 verify 实现 |
| 审批 UI | `apps/cli/interactive/approval-coordinator.ts` | 不在 security 包做 TUI |
| HTTP 审批 / 异步 run | `@code-mind/server-runtime` | api-server 注入 `permissionPrompter`；勿在 core 新增 HTTP 队列 |
| Input/tool/output guardrails | `@code-mind/security`（`guardrails/`）| **[planned, P4+]** MVP 由 PermissionEngine + SafetyGuard 覆盖 |
| Patch 应用 | `@code-mind/execution/tools` | workspace 只做路径/规则，不重复 tool |

---

## 6. 关键源码路径（Agent 快速索引）

| 能力 | Public owner 路径 | 备注 |
|------|-------------------|------|
| Session 统一入口 | `packages/core/src/agent/run-session.ts` | |
| Run kernel | `packages/core/src/agent/kernel/` | |
| Kernel runtime adapter | `packages/core/src/agent/runtime/kernel-runtime.ts` | |
| Agent loop | `packages/core/src/agent/runtime/agent-loop-controller.ts` | |
| Loop 组合（CLI/API） | `packages/agent-composition/src/compose-agent-loop.ts` | `composeAgentLoop` |
| Runtime wiring | `packages/core/src/agent/runtime/runtime-wiring.ts` | `createAgentLoopRuntimeWiring` / `createAgentLoopController` |
| 步间策略 | `packages/core/src/agent/task-strategy.ts` | LoopPolicy；与 kernel（步内）分工见 architecture §1.8 |
| Tool 调用 / 审批 | `packages/core/src/agent/runtime/tool-call-handler.ts`, `permission.ts` | |
| 结果构建 / 语义 | `packages/core/src/agent/result-builder.ts`, `result-status.ts`, `runtime/finalize.ts` | |
| Skill / plugin / subagent | `packages/capabilities/src/` | |
| Session 存储 / 回滚 | `packages/session/src/session-store.ts`, `session-revert.ts` | |
| Runtime session port | `packages/core/src/agent/runtime/ports/session-store-port.ts` | loop 内用 `SessionStorePort` |
| 验证流水线 | `packages/verify/src/verification.ts`, `review-engine.ts` | |
| 自动验证（loop 内） | `packages/core/src/agent/runtime/verification.ts` | `verification_*` events，非伪 tool |
| 默认工具 | `packages/execution/src/tools/default-tools.ts` | |
| Patch | `packages/execution/src/tools/apply-patch.ts` | |
| 权限引擎 | `packages/security/src/permissions/permission-engine.ts` | |
| System prompt | `packages/context/src/system-prompt.ts` | |
| Observability | `packages/observability/src/event-bus.ts`, `run-store.ts` | |
| CLI 入口 | `apps/cli/src/cli/index.ts` | |
| 命令分发 | `apps/cli/src/cli/yargs-app.ts` | |
| Loop 工厂（CLI） | `apps/cli/src/cli/runtime-deps.ts` | `createCliAgentLoop` → `composeAgentLoop` |
| 交互审批 | `apps/cli/src/interactive/approval-coordinator.ts` | |
| Session / Run / Approval 路由 | `apps/api-server/src/routes/` | |
| Session 回滚 | `packages/workspace/src/session-rollback.ts` + `@code-mind/session` `revertSession` | |
| 异步 Run / HTTP 审批 | `packages/server-runtime/src/` | |
| 事件流（WebSocket） | `packages/core/src/agent/runtime/runtime-event-hub.ts` | |
| 模型路由 | `packages/models/src/model-router.ts` | |
| 文件快照 / Diff | `packages/workspace/src/file-snapshot.ts`, `diff-manager.ts`, `rollback-manager.ts` | |
