# code-mind 开发指引

本仓库是 **local-first code agent** monorepo。Agent 与贡献者请按以下顺序阅读：

1. [docs/README.md](docs/README.md) — 文档路由（**先读**）
2. [docs/cli-guide.md](docs/cli-guide.md) — **编译、配置、CLI 使用**
3. [docs/implementation.md](docs/implementation.md) — 改代码前：MVP、实现状态、模块归属
4. [docs/architecture.md](docs/architecture.md) — 理解分层与设计原则

## 常用代码路径

```text
packages/core/src/agent/run-session.ts       统一 session 入口（plan-first、resume）— apps 勿绕过
packages/core/src/agent/runtime/               Agent loop（AgentLoopController）
packages/agent-composition/src/              composeAgentLoop / loadComposedToolRegistry
packages/core/src/agent/task-strategy.ts
packages/core/src/agent/result-status.ts
packages/verify/src/                         Verify / review / test-runner
packages/capabilities/src/                   Skill / plugin / subagent
packages/session/src/                        FileSessionStore 实现；apps 经 createOrchestrationSessionStore
packages/server-runtime/src/                 Async run / HTTP approval
packages/execution/src/tools/                Builtin tools
packages/context/src/                          Prompt / compaction
packages/security/src/permissions/
apps/cli/src/cli/                              CLI 入口
apps/cli/src/commands/                         命令分发
apps/cli/src/ui/                               终端渲染 / prompt
apps/cli/src/interactive/                      REPL + ApprovalCoordinator
apps/api-server/src/routes/                    run / session / approval HTTP
packages/models/src/model-router.ts
packages/models/src/adapters/
packages/workspace/src/                        snapshot / diff / rollback-manager
```

## 约束

- 模型不直接操作 FS/shell/git；副作用经 runtime → execution
- 改前查 [implementation.md §3 实现状态矩阵](docs/implementation.md#3-实现状态矩阵)
- 不要按 [implementation.md §1.4](docs/implementation.md#14-mvp-可暂缓) 或文档中的 `[planned]` 假设代码已存在

## 开发命令

```bash
pnpm install && pnpm build && pnpm test
pnpm dev -- "your task" --cwd .
```

完整 CLI 教程见 [docs/cli-guide.md](docs/cli-guide.md)。
