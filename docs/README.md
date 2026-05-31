# code-mind 文档入口

> **Agent / 贡献者：从这里开始。**  
> 开发代码必须遵守 [architecture/](./architecture/) 顶层约束，不得违背架构铁律。

---

## 你是谁？

| 角色 | 读什么 |
|------|--------|
| **Agent 改代码** | ① [architecture/principles.md](./architecture/principles.md) ② [architecture/core-boundary.md](./architecture/core-boundary.md) ③ 按任务打开 [architecture/README.md](./architecture/README.md) 路由表 |
| **用户 / 日常 CLI** | [user-guide.md](./user-guide.md)（唯一用户操作文档） |
| **排期 / 认领任务** | [backlog.md](./backlog.md) |
| **人类查历史** | [archive/](./archive/)（Agent 一般不必加载） |

---

## Agent 快速路径

```text
任何改动
  → architecture/principles.md（铁律 + MVP 边界）
  → architecture/core-boundary.md（core 能不能动）
  → architecture/README.md（按需加载子文档）

改工具          → architecture/domains/tools.md + runtime/tool-loop.md
改 kernel       → architecture/data-model.md + core-boundary.md
改 CLI 输出     → architecture/domains/cli-ui.md
改 subagent     → architecture/domains/subagent.md
改 prompt       → runtime/prompt-assembly.md
```

**禁止：** 绕过 `runAgentSession` · 在 core 内实现 capabilities/verify/session · 假设 backlog 或 `[planned]` 已落地。

---

## 文档树

```text
docs/
  README.md                 ← 本文件（Agent 入口）
  user-guide.md             ← 唯一用户文档
  backlog.md                ← 待完成任务
  architecture/             ← 架构（分层，按需加载）
    README.md               索引与路由
    principles.md           MVP + 铁律
    core-boundary.md        core 边界与冻结契约
    packages.md             包映射与状态
    data-model.md           数据模型 + 双层 FSM
    file-layout.md          文件树 + 扩展规则
    runtime/                请求生命周期子流程
    domains/                工具 / subagent / CLI UI
  archive/                  已完成项与历史验收（供人读）
```

---

## 常用代码入口

```text
packages/core/src/agent/run-session.ts
packages/agent-composition/src/compose-agent-loop.ts
packages/core/src/agent/runtime/
packages/execution/src/tools/default-tools.ts
packages/security/src/permissions/permission-engine.ts
apps/cli/src/cli/runtime-deps.ts
apps/api-server/src/routes/
```
