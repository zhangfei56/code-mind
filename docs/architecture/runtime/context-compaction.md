# Context Compaction（上下文压缩）

> scope: **context-compaction**  
> status: **implemented**（LLM-only incremental summary）  
> last updated: 2026-05-31  
> 上级索引：[README.md](./README.md) · 相关：[prompt-assembly.md](./prompt-assembly.md) · [state-persistence.md](./state-persistence.md)

本文定义 **LLM-only context compaction** 架构。实现以本文与代码为准；**无 rule-based fallback**。

---

## 1. 设计目标

| 目标 | 说明 |
|------|------|
| **长 horizon** | 多 step / 多 tool 后仍能延续任务语义。 |
| **高保真摘要** | LLM incremental merge；保留任务、决策、未解决问题、验证结论。 |
| **成本可控** | 阈值触发；可选独立 compact model（`CODE_MIND_COMPACTION_MODEL`）。 |
| **Cache 友好** | `compactionSummary` 在 **session.messages 之后** 注入。 |
| **边界清晰** | `@code-mind/context` 不调模型；编排经 `CompactionPort`（core）。 |
| **失败可观测** | LLM 失败 emit `context.compaction_failed`；同 context 体量不重复打 LLM。 |

---

## 2. 执行流程（两阶段）

```text
Tier 0 — 无操作
  estimateSessionContextChars(session) < charThreshold（默认 18_000）
  messages + observations 字符和

Tier 1 — Window retain + LLM summary
  buildCompactionSummarizeInput()
    → evicted messages/observations（默认保留最近 8/8）
    → 超阈值但 slice 为空时：fallback 将全部 observations + 除最后一条外的 messages 送入 LLM
  CompactionPort.summarize() → ModelProvider.chat(tools=[], purpose=compaction)
    ├─ 成功 → replace compactionSummary + slice + compact-NNN.md + context.compacted
    └─ 失败 → context.compaction_failed + compactionBlockedContextChars；不裁、不写 summary
```

**无 Tier 3 rule fallback**。LLM 失败时不静默降级。

---

## 3. 触发时机

```text
step-runner → 每个 tool 完成后 → compactSessionIfNeeded()
  （不在每个 model step 自动 compact）
```

Session 状态：`compacting` ↔ `running`。

### 配置（env + config.yaml）

| 来源 | 字段 | 默认 | 含义 |
|------|------|------|------|
| env | `CODE_MIND_COMPACTION_CHAR_THRESHOLD` | 18000 | 触发阈值（messages + observations 字符） |
| env | `CODE_MIND_COMPACTION_MODEL` | 同 run model | 独立 compact 模型名（config models 键名） |
| yaml | `compaction.char_threshold` | 18000 | 同上（env 覆盖） |
| yaml | `compaction.retained_messages` | 8 | window retain |
| yaml | `compaction.retained_observations` | 8 | window retain |
| yaml | `compaction.model` | — | config `models` 键名，如 `compact` |

```yaml
compaction:
  char_threshold: 18000
  retained_messages: 8
  retained_observations: 8
  model: compact   # optional dedicated model key
```

`CompactionPolicy`（`@code-mind/shared`）：`charThreshold`、`retainedMessages`、`retainedObservations`、`modelName?`。解析：`resolveCompactionPolicy()`（config → env 覆盖）。

---

## 4. LLM 摘要契约

### 4.1 必须保留

任务、关键决策、未解决问题、验证结论、证据级路径/文件/命令、上一轮 summary 仍有效条目。

### 4.2 必须丢弃

完整 tool stdout、重复 read、无关探索、权限 chatter（除非 pending）。

### 4.3 不进 summary

`modifiedFiles` 清单、step 预算、RunFacts 动态 progress。

### 4.4 输出格式

以 `# Session compaction (rolling)` 开头；含 `## Task` / `## Decisions` / `## Open issues` / `## Evidence`。

模板：`packages/context/src/compaction-prompt.ts`（locale 从 profile/model 推断）。

---

## 5. Prompt 注入顺序

见 [prompt-assembly.md §ModelRequest](./prompt-assembly.md)：`session.messages` → `compactionSummary` system → closing turn。

---

## 6. 包边界

```text
@code-mind/shared
  CompactionPolicy / CompactionSummarizeInput / CompactionSummarizeResult / CompactionLedgerRecord
  resolveCompactionPolicyFromEnv()

@code-mind/context
  shouldCompact / estimateSessionContextChars / buildCompactionSummarizeInput
  applyCompaction / hasCompactionEviction
  buildCompactionMergePrompt / buildCompactionMergeMessages
  resolveCompactionLocale()

@code-mind/core
  CompactionPort + createCompactionPort(model)
  compactSessionIfNeeded() — session-lifecycle.ts

@code-mind/agent-composition
  buildCompactionRuntimeOverrides() — CLI/API 注入 compactionModel

@code-mind/session
  saveCompactSummary → compact-NNN.md
  recordCompaction → compaction-ledger.jsonl
  restore：最新 compact 文件 + window retain slice
```

### CompactionPort

```typescript
interface CompactionPort {
  summarize(input: CompactionSummarizeInput, options?: { abortSignal? }): Promise<CompactionSummarizeResult>;
}

interface CompactionSummarizeResult {
  summaryMarkdown: string;
  strategy: "llm";
  modelName: string;
  usage?: TokenUsage;
  durationMs?: number;
}
```

---

## 7. 持久化与 Resume

| 存储 | 内容 |
|------|------|
| `metadata.compactionSummary` | 当前 rolling Markdown（replace） |
| `compact/compact-NNN.md` | 每轮快照（完整 rolling 文） |
| `compaction-ledger.jsonl` | strategy、evicted/retained 计数、usage、model |
| `usage-ledger.jsonl` | `purpose: "compaction"` 的 model 调用 |
| `metadata.compactionBlockedContextChars` | LLM 失败后防重试标记 |

**Resume**（`session-restore.ts`）：

1. 只读 **最新** `compact-NNN.md` 作为 `compactionSummary`（不拼接历史文件）
2. 若 `compactionCount > 0`，对 messages/observations 做与运行时相同的 window retain slice

---

## 8. 观测与 CLI

| 事件 | 说明 |
|------|------|
| `context.compacted` | 成功；含 `strategy: llm`、`usage`、`durationMs`、evicted 计数 |
| `context.compaction_failed` | LLM 失败；含 `reason`、`contextChars`、`modelName` |

CLI L2 示例：

```text
context compacted · llm · ×1 · 12 blocks → summary
context compaction failed · Compaction model returned empty summary.
```

---

## 9. 反模式

```text
❌ 在 @code-mind/context 内直接 fetch 模型
❌ 每个 model step 做 compact
❌ compactionSummary 插在 session.messages 之前
❌ modifiedFiles 写进 summary
❌ LLM 失败 silent no-op（必须 event + block 重试）
❌ compact 调用带 tool schema（必须 tools=[]）
❌ restore 拼接全部 compact 文件（只用最新）
```

---

## 10. Trace eval

固定 session fixture + anchor 列表，CI 用 `scoreCompactionSummaryRecall()` 校验 summary 召回率（无真实 LLM）：

- `packages/context/src/compaction-eval.ts`
- `tests/unit/compaction-eval.test.ts`
