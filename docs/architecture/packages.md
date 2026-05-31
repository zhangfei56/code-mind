# 包映射与实现状态

> layer: **architecture / packages**  
> audience: agent（判断代码应落在哪个包、当前成熟度）  
> 上级索引：[architecture/README.md](./README.md)

---

## 1. 逻辑层 → Package

| 逻辑层 | Package | Public owner | 说明 |
|--------|---------|--------------|------|
| Agent Orchestration | `@code-mind/core` | `run-session.ts`, `runtime/*`, `kernel/*` | 统一入口 `runAgentSession` |
| Composition | `@code-mind/agent-composition` | `compose-agent-loop.ts` | CLI/API 默认 wiring |
| Capabilities | `@code-mind/capabilities` | skill/plugin/hook/subagent | |
| Session | `@code-mind/session` | session-store, restore, revert | apps 经 `SessionStorePort` |
| Verification | `@code-mind/verify` | verification, review-engine | loop 内 adapter 在 core |
| Server runtime | `@code-mind/server-runtime` | async run, HTTP 审批队列 | |
| Context | `@code-mind/context` | context-manager, compaction 纯函数与模板 | 不调模型；LLM 摘要经 core `CompactionPort` |
| Models | `@code-mind/models` | model-router, adapters | |
| Execution | `@code-mind/execution` | tools/*, mcp-adapter | 无 sandbox 内嵌 |
| Workspace | `@code-mind/workspace` | snapshot, diff, rollback, rules | |
| Security | `@code-mind/security` | permission-engine, safety-guard | |
| Observability | `@code-mind/observability` | event-bus, run-store | partial |
| Memory | `@code-mind/memory` | interface + noop | stub |
| Config / Shared | `@code-mind/config`, `shared` | | |
| View | `apps/cli`, `apps/api-server` | | 无 `apps/web` |

---

## 2. 实现状态矩阵

| Package / App | 状态 | 说明 |
|---------------|------|------|
| shared, config, models, context, execution, security, core | **production** | MVP 可依赖 |
| capabilities, session, verify, server-runtime, apps/cli | **production** | |
| workspace, observability, apps/api-server | **partial** | 有实现但不全 |
| memory | **stub** | `NoopMemoryProvider` |

**production** = 可依赖 · **partial** = 不全 · **stub** = 仅占位

---

## 3. 模块归属（禁止重复实现）

| 逻辑模块 | Owner | 禁止 |
|----------|-------|------|
| Repo Map | `@code-mind/context` [planned] | 第二份 repo-map |
| AGENTS.md 加载 | `@code-mind/workspace/project-rules` | context 内 agents-loader |
| Sandbox | `plugins/` + execution [planned] | core 内嵌 E2B |
| Skill / subagent | `@code-mind/capabilities` | core/extensions |
| Patch / 工具 | `@code-mind/execution/tools` | workspace 重复 tool |
| 审批 UI | `apps/cli/interactive` | security 包做 TUI |
| HTTP 审批 | `@code-mind/server-runtime` | core 内 HTTP 队列 |
| Guardrails | `@code-mind/security/guardrails` [P4+] | 替代 PermissionEngine |

---

## 4. 关键源码索引

| 能力 | 路径 |
|------|------|
| Session 入口 | `packages/core/src/agent/run-session.ts` |
| Kernel | `packages/core/src/agent/kernel/` |
| Loop | `packages/core/src/agent/runtime/agent-loop-controller.ts` |
| Context compaction 编排 | `packages/core/src/agent/runtime/session-lifecycle.ts` + `ports/compaction-port.ts` [Phase 1+] |
| Compaction 纯函数 | `packages/context/src/compaction.ts` + `compaction-prompt.ts` + `compaction-locale.ts` — window retain、阈值、LLM merge 输入 |
| Composition | `packages/agent-composition/src/compose-agent-loop.ts` |
| 默认工具 | `packages/execution/src/tools/default-tools.ts` |
| 权限 | `packages/security/src/permissions/permission-engine.ts` |
| CLI 组合 | `apps/cli/src/cli/runtime-deps.ts` |
| API 路由 | `apps/api-server/src/routes/` |

完整文件树见 [file-layout.md](./file-layout.md)。
