# 架构文档索引

> **Agent 改代码必读。** 先读 [principles.md](./principles.md) 与 [core-boundary.md](./core-boundary.md)，再按修改范围加载下表对应文档。

---

## 第一层：全局约束（几乎每次都要读）

| 文档 | 何时读 |
|------|--------|
| [principles.md](./principles.md) | **任何 PR 前** — MVP 边界、架构铁律 |
| [core-boundary.md](./core-boundary.md) | 动 `packages/core`、ports、kernel、public API |
| [packages.md](./packages.md) | 不确定代码应落在哪个包 |
| [data-model.md](./data-model.md) | 改 shared 类型、RunState、kernel phase |
| [file-layout.md](./file-layout.md) | 新增文件/目录、扩展功能 |

---

## 第二层：Runtime 流程（改 loop 时按需读）

主流程图：[runtime/README.md](./runtime/README.md)

| 文档 | 何时读 |
|------|--------|
| [runtime/prompt-assembly.md](./runtime/prompt-assembly.md) | context / system prompt / tool schema 选择 |
| [runtime/tool-loop.md](./runtime/tool-loop.md) | 工具授权、执行、observation |
| [runtime/human-in-the-loop.md](./runtime/human-in-the-loop.md) | 审批 interrupt / resume |
| [runtime/state-persistence.md](./runtime/state-persistence.md) | checkpoint、resume、RunState |
| [runtime/completion.md](./runtime/completion.md) | finalize、verification、effectiveStatus |
| [runtime/delegation.md](./runtime/delegation.md) | subagent / handoff |
| [runtime/capability-selection.md](./runtime/capability-selection.md) | skill / plugin 选择 |
| [runtime/mcp-integration.md](./runtime/mcp-integration.md) | MCP |
| [runtime/observability.md](./runtime/observability.md) | events、trace、redaction |

---

## 第三层：领域专题（只改该领域时读）

| 文档 | 何时读 |
|------|--------|
| [domains/tools.md](./domains/tools.md) | 新增/修改 builtin 或 MCP 工具 |
| [domains/subagent.md](./domains/subagent.md) | subagent 策略与边界 |
| [domains/cli-ui.md](./domains/cli-ui.md) | CLI 输出层级、TUI 布局 |

---

## 冲突优先级

```text
core-boundary.md > principles.md > data-model / file-layout > runtime/ > domains/
```

待办功能见 [../backlog.md](../backlog.md)（**不要**把 backlog 当已实现 spec）。
