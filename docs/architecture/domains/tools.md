# 工具架构

> layer: **architecture / domains / tools**  
> audience: agent（新增/修改 builtin 工具、MCP 工具、权限规则时读）  
> 上级索引：[architecture/README.md](../README.md)  
> 执行流程见 [runtime/tool-loop.md](../runtime/tool-loop.md)

---

## 1. 归属规则

| 职责 | Owner |
|------|-------|
| Tool 实现 | `packages/execution/src/tools/` |
| 注册 | `default-tools.ts` 或 composition/runtime 动态注册 |
| 权限 | `packages/security/src/permissions/permission-engine.ts` |
| 审批 / lifecycle | `packages/core/src/agent/runtime/tool-call/` |
| MCP adapter | `packages/execution/src/mcp/mcp-adapter.ts` |

**禁止**在 `packages/core` 内实现具体 tool 副作用。

---

## 2. 默认 builtin 工具（`registerDefaultTools`）

```text
list_dir, read_file, glob, grep
git_status, git_diff, git_log, git_show, git_changed_files, git_restore_file
lsp_diagnostics
worktree_create, worktree_status, worktree_diff, worktree_cleanup
apply_patch, write_file, search_replace, delete_file, move_file
run_shell
```

## 3. 动态注册（非 default-tools.ts）

```text
enter_plan_mode / exit_plan_mode    plan-mode-tools.ts
run_subagent                        composeAgentLoop
mcp__{server}__{tool}               MCP adapter（stdio）
```

---

## 4. 文件写操作共性

写类工具（patch / write / search_replace / delete / move）共用 snapshot + diff 审计，见 `file-write-helper.ts`、`file-mutation-helper.ts`。注册后须同步：

- `FILE_EDIT_TOOLS`（lifecycle）
- `permission-engine.ts` 路径规则
- CLI tool 展示（`tool-blocks.ts`、`tool-call-line.ts`）
- subagent 写权限（如适用）

---

## 5. 测试

`tests/unit/tools.test.ts`、`permission-engine.test.ts`、`agent-mode-registry.test.ts`
