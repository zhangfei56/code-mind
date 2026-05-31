# 系统原则与 MVP 边界

> layer: **architecture / principles**  
> audience: agent（**必读**：任何代码变更前确认不越界）  
> 上级索引：[architecture/README.md](./README.md)

---

## 1. 产品定位

code-mind 是 **local-first code agent** monorepo。第一版目标是 **code agent 闭环**，不是一次性实现全量平台。

### 1.1 MVP 链路

```text
CLI / API (AgentMode: ask | plan | edit | agent)
 ↓
runAgentSession（plan-first、worktree、resume）
 ↓
AgentLoopController + LoopPolicy
 ↓
Prompt / Context → Model
 ↓
PermissionEngine + SafetyGuard + Approval
 ↓
Tool Executor（mode-gated）
 ↓
VerificationPipeline（edit/agent）
 ↓
finalize + ResultBuilder
```

### 1.2 已具备的核心能力

| 能力 | 状态 |
|------|------|
| 读文件 / 搜索（grep、glob） | 已有 |
| 写改删移文件 + patch | 已有 |
| plan / plan-first | 已有 |
| 测试验证 + review recovery | 已有 |
| session revert / worktree | 已有 |
| subagent（`run_subagent`） | 已有 |
| CLI + 薄 HTTP API | 已有 |

### 1.3 明确暂缓（勿假设已实现）

```text
独立 Web App、Desktop、完整 Control Plane
复杂多 Agent Workflow / DAG
知识图谱 / 向量记忆、长期异步队列
云端 Sandbox（E2B / Daytona）、插件市场
Code Intelligence 全量（调用图、依赖图）
Handoff、Agent-as-tool
独立 Guardrails 子系统（MVP 用 PermissionEngine + SafetyGuard）
```

待做项见 [backlog.md](../backlog.md)。**不要**按文档中的 `[planned]` 或上述列表假设代码已存在。

---

## 2. 架构铁律（违反即错误 PR）

1. **副作用唯一入口**：模型不直接操作 FS / shell / git；必须经 `core` runtime → `execution`。
2. **统一 session 入口**：apps 必须 `runAgentSession`，禁止绕过权限链。
3. **包依赖无环**：`packages/*` 不得依赖 `apps/*`；`execution` 不依赖 `core`；`core` 不依赖 `server-runtime`。
4. **双层 FSM 分工**：步内 phase → Run Kernel；步间 step 预算 → Controller + `task-strategy`。详见 [data-model.md §1.8](./data-model.md#18-双层-fsm-与执行分层)。
5. **扩展只允许三类插口**：Port / 包 / Apps 组合。详见 [file-layout.md §2.7](./file-layout.md#27-扩展规则三类插口)。
6. **插件优先**：记忆、沙箱、外部 MCP 走 `plugins/`，不写死进 core。
7. **权限链顺序不可变**：model → permission → safety → approval → hooks → executor。

---

## 3. 冲突优先级

```text
core-boundary.md > principles.md（本文）> data-model / file-layout > runtime/ 子文档 > backlog
```

---

## 4. 开发命令

```bash
nvm use 22
pnpm install && pnpm build
pnpm exec tsx tests/run-tests.ts
```

用户操作见 [user-guide.md](../user-guide.md)。
