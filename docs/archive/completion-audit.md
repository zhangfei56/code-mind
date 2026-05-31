# Core Completion Audit Checklist

> status: active  
> last updated: 2026-05-30（扩展路径清单、双层 FSM 验收项）  
> 用途：在发布、合并大 refactor、或完成 core 稳定化阶段后，逐项验证核心闭环。

## 如何运行

```bash
# Node >= 22
pnpm build
pnpm exec tsx tests/run-tests.ts
```

关键自动化用例（非完整列表）：

| 验收项 | 测试 |
|--------|------|
| Kernel transition / command | `tests/unit/run-kernel.test.ts` |
| Kernel trace event | `tests/unit/kernel-observability.test.ts` |
| Ports wiring | `tests/unit/runtime-ports.test.ts` |
| Approval checkpoint | `tests/unit/tool-call-approval.test.ts` |
| Resume normalize | `tests/unit/recovery-resume-hardening.test.ts` |
| Capability selector | `tests/unit/capability-selector.test.ts` |
| Core path audit | `tests/unit/kernel-observability.test.ts` (`runCoreStabilityAuditTests`) |
| Composition merge | `tests/unit/agent-composition.test.ts` |
| Session port in tests | `tests/unit/helpers/session-store.ts`（`createTestSessionStore`） |
| API HITL + SessionStorePort | `tests/unit/api-approval.test.ts` |

## 验收清单

### Kernel 与 Runtime

- [x] `packages/core/src/agent/kernel/` 含 state / event / command / invariant / ports
- [x] **步内**阶段变更均通过 `applyRunKernelEventAndCheckpoint()` 或等价 kernel adapter
- [x] **步间**调度在 `AgentLoopController` + `task-strategy`（不要求 kernel step 命令）
- [x] Step 执行在 `createRunScopedKernelPorts` 之后经 `createRunScopedStepRunner` 构建（无 unscoped checkpoint 占位）
- [x] `dispatchRunKernelCommands()` / `dispatchKernelTransitionCommands()` 为 command 分发入口
- [x] 非法 transition 有失败测试（terminal phase、phase/event mismatch、pending tool calls）

### 持久化与恢复

- [x] `run-state.json` v4 含 `kernel` 字段
- [x] Resume 走 `normalizeKernelStateForResume()`，坏 checkpoint 不污染恢复态
- [x] Approval pending 时 persisted `phase=awaiting_approval`
- [x] Run 结束时 persisted `phase` 为 `completed` / `cancelled` / `failed`

### 权限与 HITL

- [x] Tool call 必经 `tool-call/authorization.ts`
- [x] PermissionEngine + SafetyGuard 在 prompt 外强制执行
- [x] Approval interrupt 前后有 checkpoint

### 能力与 Prompt

- [x] Tool schema 结构化选择（`tool-schema-selection.ts` + capability selector）
- [x] Closing turn / summary retry 强制 `tools=[]`
- [x] Skill context 通过 selector 注入，不整篇 SKILL.md 默认进 system

### Observability

- [x] 每次 kernel transition 写入 `kernel.transition` 事件（含 phase、step、commands、checkpointReasons）
- [x] `core.run-kernel` process log 与 transition event payload 一致
- [x] 可从 event log 还原 step → phase 序列

### 包边界

- [x] `@code-mind/core` 不 public export capabilities / verify / session / server-runtime 实现（`runCoreStabilityAuditTests` 审计 index）
- [x] `packages/core/src/extensions|session|verify` compat copy 已删除
- [x] 新能力实现进 owning package（见 [core-boundary.md](../architecture/core-boundary.md)）
- [x] Runtime loop 持久化经 `SessionStorePort`；apps/API HITL 经 `createOrchestrationSessionStore`
- [x] L1 产品 API 未 breaking change（`runAgentSession`、result/status 语义）

### 扩展路径（新功能 PR 自检）

新功能应只走以下路径之一（详见 [file-layout.md §2.7](../architecture/file-layout.md#27-扩展规则三类插口)）：

| 需求 | 应走 |
|------|------|
| 新工具 / MCP | `@code-mind/execution` + `@code-mind/security` 权限 |
| 新模型 | `@code-mind/models` + `ModelPort` |
| 新审批 UI | `HumanApprovalPort` + apps 注入 |
| 新验证/审查 | `@code-mind/verify` + Verification/Review port |
| 新步内阶段 | 新 `RunKernelEvent` + kernel 测试 |
| 新步间策略 | `task-strategy` / controller |
| 新默认可选能力 | apps composition（非 core 内 load 磁盘） |

- [x] PR 未在 runtime 主路径增加无法映射 kernel 的步内分支
- [x] PR 未绕过 `runAgentSession` 或权限链（含 `apps/cli` benchmark 经 `runAgentSession`）

### 构建

- [x] `pnpm build` 通过
- [x] `pnpm exec tsx tests/run-tests.ts` 在 Node >= 22 环境通过（需 localhost bind 的 API 测试视环境而定）

### 增强项（不纳入核心验收）

以下 **planned**，有 MVP 替代：

- [ ] 独立 guardrails（`PermissionEngine` + `SafetyGuard` 已覆盖 MVP）
- [ ] replay-engine（`kernel.transition` + run-store 已可审计）
- [ ] embedding capability 召回（启发式 selector 已可用）

## Event log 还原 kernel phase（手工抽查）

一次 run 的 `events.jsonl` 应包含按 step 排序的 `kernel.transition` 记录。典型序列：

```text
step_started            initializing → assembling_prompt
prompt_assembled        assembling_prompt → calling_model
model_response_received calling_model → handling_tools | finalizing
approval_requested      * → awaiting_approval
approval_resolved       awaiting_approval → executing_tool | recovering
tool_calls_handled      handling_tools → assembling_prompt | finalizing
recovery_requested      finalizing | executing_tool | handling_tools → recovering
run_completed           * → completed
```

每条 `kernel.transition` payload 应包含：

```text
eventType, fromPhase, toPhase, step, maxSteps,
closingTurn, pendingToolCalls, commands, checkpointReasons, primaryCommand
```

## 相关文档

- [core-boundary.md](../architecture/core-boundary.md) — 包归属与 API 分层
- [packages.md](../architecture/packages.md) — 包映射与实现状态
- [architecture/runtime/observability.md](../architecture/runtime/observability.md) — 事件类型与 redaction
