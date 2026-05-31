# 待完成任务

> status: active  
> last updated: 2026-05-31  
> **Agent：仅当用户明确要求实现某功能时加载本文。** 勿把 `[ ]` 项当作已存在代码。

优先级：**P0** 阻塞 · **P1** 体验 · **P2** 下一迭代 · **P3** 增强 · **P4+** / **Deferred** post-MVP

已完成项见 [archive/completed-tasks.md](./archive/completed-tasks.md)。

---

## P1 — CLI Runtime 事件

| ID | 状态 | 任务 | 验收 |
|----|------|------|------|
| CLI-01 | [~] | `contextTokens` / `maxContextTokens` 稳定 emit | status bar / footer |
| CLI-02 | [~] | `tokenUsage` 累计写入 turn 事件 | `/cost`、L3 trace |
| CLI-03 | [~] | `modifiedFiles` 计数 footer | edit 结束 stderr |

## P1 — Context Compaction（LLM 增量摘要）

架构：[runtime/context-compaction.md](./architecture/runtime/context-compaction.md) · Phase 0（F 静态、summary 后置、env date 冻结）已合并。

| ID | Phase | 状态 | 任务 | 验收 |
|----|-------|------|------|------|
| CTX-CMP-1 | 1 | [x] | `CompactionPolicy` / Port 类型（strategy 固定 `llm`） | shared + `compaction-port.ts` 可编译 |
| CTX-CMP-2 | 1 | [x] | context 拆分 + `buildCompactionMergePrompt` | context 纯函数 |
| CTX-CMP-3 | 2 | [x] | `createCompactionPort` + `compactSessionIfNeeded` | LLM-only；失败 event + block |
| CTX-CMP-4 | 3 | [x] | `context.compacted` 扩展 + CLI L2 + compaction-ledger | 见 cli-ui §L2 |
| CTX-CMP-5 | 4 | [x] | config.yaml compaction、trace eval、`/context` 指标 | config + env；eval harness；messages/ctx/compact |

## P2 — 工具与 Core

| ID | 状态 | 任务 | 验收 |
|----|------|------|------|
| TOOL-06 / CTX-01 | [ ] | Repo Map Builder | `@code-mind/context` 注入 |
| CORE-07 | [~] | Pending writes 状态模型 | resume 可补偿 |
| CORE-08 | [~] | Diff 展示产品化 | CLI `/diff` 增强 |
| CORE-10 | [~] | Workspace 包与 pending writes 对齐 | |
| TEST-03 | [ ] | delete/move 集成测试 | temp workspace + revert |
| CLI-04 | [~] | `context.compacted` L2 一行 | 命名与 spec 统一 |
| CLI-05 | [ ] | `modelCallDurationMs` | `--trace` |
| CLI-06 | [ ] | `toolCallDurationMs` | tool finished 事件 |
| CLI-07 | [ ] | Step 内 LLM 自由文本发现 | journal / activity |
| HITL-03 | [ ] | 审批 edit | pause/resume + 审计 |
| HITL-04 | [ ] | 审批 clarify | 注入 observation |
| API-01 | [~] | api-server Web UI 扩展 | plan 审批、session diff |
| TEST-02 | [~] | API 测试 localhost 环境说明 | CI/README |

## P3 — 增强

| ID | 状态 | 任务 |
|----|------|------|
| TOOL-07 | [ ] | LSP 扩展（symbols/definition/references） |
| TOOL-08 | [ ] | 是否暴露独立 `run_tests` tool（决策） |
| CORE-01 | [~] | Plan artifact 结构化解析 |
| CORE-09 | [ ] | Session fork / 只读 replay |
| CTX-02 | [~] | Embedding 能力召回 |
| CAP-01 | [ ] | 低置信 skill HITL |
| HITL-05 | [ ] | Web plan 审批面板 |
| MCP-02~07 | [ ] | MCP resources/prompts/roots/elicitation/sampling/非 stdio |
| OBS-01~03 | [~]/[ ] | replay-engine、cost trace、eval hooks |
| TEST-01 | [ ] | 真实模型 e2e |
| CLI-08 | [ ] | OpenCode attach/acp/pr 或文档明确不做 |

## P4+ / Deferred — 不在当前 scope

Handoff · Agent-as-tool · 多 Agent DAG · Guardrails 子系统 · Code Intelligence · 独立 Web/Desktop · 插件市场 · 云端 Sandbox · 向量记忆 · 异步任务队列 · plugins（memory/sandbox/mcp-github）

---

## 建议顺序

```text
Wave 1: CTX-CMP-1~3（LLM compaction 主路径）, CLI-01~03
Wave 2: CTX-CMP-4~5, TOOL-06/CTX-01, CLI-05~07, HITL-03~04
Wave 3: CORE-01, MCP 择要, HITL-05, OBS/TEST-01
Wave 4: P4+ / Deferred
```

架构约束见 [architecture/principles.md](./architecture/principles.md)。
