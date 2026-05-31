# 已完成功能（归档）

> last updated: 2026-05-31  
> 从全量 backlog 拆出；**Agent 无需加载**。

---

## 核心闭环（2026-05 验收通过）

详见 [completion-audit.md](./completion-audit.md)。

- Run kernel FSM + checkpoint + resume normalize  
- PermissionEngine + SafetyGuard + approval interrupt  
- VerificationPipeline + ReviewEngine recovery  
- Subagent（`run_subagent`）+ plan mode protocol  
- Session revert + worktree  
- CLI L0–L4 + `--tui` + REPL  
- `pnpm build` + 79 tests（Node ≥ 22）

---

## 内置工具

| ID | 项 |
|----|-----|
| TOOL-01~05 | glob, write_file, search_replace, delete_file, move_file |
| MCP-01 | MCP tools + stdio + `mcp__*` 命名 |

---

## Core / Agent

| ID | 项 |
|----|-----|
| CORE-02 | ReviewEngine 接入主 loop |
| CORE-03 | Sub-agent spec |
| API-02 | 异步 run + WebSocket 事件流 |

---

## HITL

| ID | 项 |
|----|-----|
| HITL-01 | Tool 审批 approve/reject/always |
| HITL-02 | Plan-first 审批 + abort |

---

## 文档债（2026-05-31 已完成）

| ID | 项 |
|----|-----|
| DOC-01~07 | tool-loop / architecture 树 / implementation 标注 / MCP·HITL·delegation 实现状态 / README 路由 |

---

## 文档重组（2026-05-31）

- 架构文档迁入 `docs/architecture/` 分层  
- 用户文档合并为 `user-guide.md`  
- 待办拆为 `backlog.md`；本文件 + `completion-audit.md` 归档  
