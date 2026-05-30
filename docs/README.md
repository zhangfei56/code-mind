# code-mind 文档路由

> **Agent / 贡献者请先读此文件**，再打开对应专题 doc。

## 按任务跳转

| 我想… | 读 |
|-------|-----|
| 改代码、加功能、评审 PR | [implementation.md](./implementation.md) |
| 判断什么能放进 `packages/core`、什么必须迁出 | **[core-boundary.md](./core-boundary.md)** |
| 发布前 / 大 refactor 后验收核心闭环 | **[completion-audit-checklist.md](./completion-audit-checklist.md)** |
| **编译、配置、使用 CLI** | **[cli-guide.md](./cli-guide.md)** |
| 设计 CLI 输出 / 进度 / 层级 | [cli-display-spec.md](./cli-display-spec.md) |
| 设计 `--tui` 布局与交互 | [code-mind-tui-final-layout.md](./code-mind-tui-final-layout.md) |
| 查看数据模型、包结构、双层 FSM | [architecture.md](./architecture.md) |
| 理解请求生命周期（prompt、tool loop、HITL） | [request-lifecycle/README.md](./request-lifecycle/README.md) |
| 子代理何时用、边界、契约 | [subagent-policy.md](./subagent-policy.md) |
| 看下一批待做 | [implementation.md §1.5](./implementation.md#15-已知缺口下一批优先) |
| 找现有源码 | 直接搜 `packages/`、`apps/`（不要依赖手写目录树） |

## 文档清单

| 文件 | 用途 |
|------|------|
| [implementation.md](./implementation.md) | MVP、实现状态、包映射、模块归属 |
| [core-boundary.md](./core-boundary.md) | core public API、包归属、冻结契约 |
| [completion-audit-checklist.md](./completion-audit-checklist.md) | 发布前验收与测试映射 |
| [architecture.md](./architecture.md) | 数据模型、文件组织、双层 FSM |
| [cli-guide.md](./cli-guide.md) | 编译、模型配置、CLI 工作流 |
| [cli-display-spec.md](./cli-display-spec.md) | CLI 披露层级与输出规范 |
| [code-mind-tui-final-layout.md](./code-mind-tui-final-layout.md) | `--tui` 布局与交互 |
| [request-lifecycle/](./request-lifecycle/README.md) | 请求生命周期子流程 |
| [subagent-policy.md](./subagent-policy.md) | 子代理策略 |

## 冲突优先级

```text
core-boundary.md > implementation.md > architecture.md > request-lifecycle/
```

## 常用代码入口

```text
packages/core/src/agent/run-session.ts       统一 session 入口
packages/agent-composition/src/              composeAgentLoop
packages/core/src/agent/runtime/             Agent loop
packages/capabilities/src/                   Skill / plugin / subagent
packages/session/src/                        存储；apps 用 createOrchestrationSessionStore
packages/verify/src/                         Verify / review
packages/server-runtime/src/                 HTTP 审批 / 异步 run
apps/cli/src/                                CLI + REPL
apps/api-server/src/routes/                  HTTP API
```
