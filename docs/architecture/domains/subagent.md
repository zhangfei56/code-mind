# Sub-agent 策略规范

> scope: **subagent-policy**  
> audience: agent, contributor, product  
> 定义 **何时委派子代理、边界、输入输出契约、与主流程闭环**。实现与 prompt 须与本 spec 对齐。

相关文档：[data-model.md](../data-model.md) · [packages.md](../packages.md) · [user-guide.md](../../user-guide.md)

---

## 1. 目标与范围

### 1.1 子代理解决什么问题

子代理（sub-agent）不是「再开一个更聪明的 agent」，而是：

| 能力 | 说明 |
|------|------|
| **Context 隔离** | 大量 read/grep 在子 session 内完成，主 session 只接收 summary |
| **工具收窄** | 子代理只能使用定义中的 tool allowlist |
| **预算可控** | 独立 `maxSteps`，避免主 loop 被探索耗尽 |
| **职责单一** | 一次 spawn 对应一个可验收的子问题 |

### 1.2 不在本 spec 范围

- 多 agent workflow / 编排 DAG（Phase 2+）
- 子代理嵌套 spawn（**禁止**）
- 子代理代替主流程做 patch / 验证 / 对用户交付（**禁止**）

### 1.3 与现有概念的关系

```text
CollaborationMode (ask | plan | edit | agent)
  → 硬约束：工具 schema、PermissionEngine、能否 patch

Plan Mode Protocol (enter_plan_mode / exit_plan_mode)
  → edit/agent 内的只读规划阶段；可配合 plan/explore 子代理调研

--plan-first
  → 独立 plan session → 用户审批 → execute session（已是分 session，通常不需再 spawn plan 子代理）

run_subagent
  → 主 session 内的委派入口；spawn 后产生 child session，结果回灌主 session
```

---

## 2. 角色分工（逻辑闭环）

### 2.1 三层职责

```text
┌─────────────────────────────────────────────────────────────┐
│ 主 Agent（Main Session）                                     │
│  · 理解用户意图、优先级、最终答复                              │
│  · 持有 RunFacts（modifiedFiles / verification / planMode）   │
│  · apply_patch · run_shell · 验证 · recovery                 │
│  · 决定是否 spawn、如何消费 summary                           │
└───────────────────────────┬─────────────────────────────────┘
                            │ run_subagent(task, agentName)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 子 Agent（Child Session）                                    │
│  · 单一只读（或 yaml 定义的受限）子任务                        │
│  · 隔离 context；默认不写入主 session 消息历史                  │
│  · 输出：summary + findings（结构化短文）                      │
│  · 禁止：嵌套 spawn · enter_plan_mode · 对用户的 final 交付   │
└───────────────────────────┬─────────────────────────────────┘
                            │ summary 作为 tool result
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 主 Agent 继续                                                │
│  · 将 summary 当作观测，更新计划                              │
│  · 执行 patch / test / 向用户解释                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 主流程永远负责

以下 **不得** 下放给子代理（builtin 或 custom）：

1. 对用户的 **最终结论**（bug 根因、改动说明、未完成原因）
2. **apply_patch** 及 edit/agent 下的验证 / recovery loop
3. **Plan 审批**（`exit_plan_mode`、`--plan-first` 的 `approvePlan`）
4. 跨模块 **取舍**（先修 A 还是先修 B）
5. Session 级 **RunFacts** 与 **closing turn**

### 2.3 子代理永远负责

1. 在 **明确子问题** 下完成调研或 plan 草稿（只读）
2. 返回 **短 summary**（见 §5），不是 raw tool dump
3. 遵守 **tool allowlist** 与 **step 预算**
4. 在 metadata 中标记 `subagent: true`（实现已做）

---

## 3. 何时用主流程，何时 spawn 子代理

### 3.1 默认规则

> **主流程优先。** 只有满足 §3.2 的触发条件时，才调用 `run_subagent`。

主流程直接使用的典型动作：

- `list_dir` → 定位入口
- 1–3 次定向 `read_file` / `grep`
- 已知文件上的 patch + test

### 3.2 触发条件（满足任一即可考虑 spawn）

| ID | 条件 | 推荐 agent | 说明 |
|----|------|------------|------|
| T1 | **广域只读扫描**：跨多个 top-level 目录、多条 grep 线、找调用链/入口 | `explore` | 避免主 context 被大量检索结果填满 |
| T2 | **Plan mode 内**需深入调研后再写 plan-draft | `explore` 或主流程 read | 复杂改造；简单 plan 不必 spawn |
| T3 | 用户 **显式** 要求并行/专家（「让 reviewer 看」「并行搜一下」） | custom 或 `explore` | 用户意图即委派 |
| T4 | 主 context **已接近 compaction**，仍需新一轮只读调研 | `explore` | 外包探索，只带回结论 |
| T5 | 子问题 **可独立验收** 且与主线程改代码 **可并行** | `explore` / custom | 例：「查测试命令」与「改 src」 |

### 3.3 不应 spawn 的条件（Anti-spawn）

| ID | 条件 | 正确做法 |
|----|------|----------|
| A1 | 任务范围小（1–3 文件、单函数 bug） | 主流程 read → patch |
| A2 | 刚读过关键文件，下一步是改或测 | 直接 patch / verify |
| A3 | 子问题 **不明确**（「找 bug」「看看项目」） | 主流程先 narrow：list_dir、test、git diff |
| A4 | 当前已是 **ask/plan mode** 且探索步数仍充足 | 主流程只读即可 |
| A5 | `--plan-first` 的 plan session 且任务仅是写 plan | 主 plan session 自己调研；仅 T1/T4 时才 explore |
| A6 | 期望子代理 **改代码** | 用主流程 edit/agent；custom 若含 write tools 须单独审批策略 |

### 3.4 决策流程图

```text
                    用户任务
                       │
                       ▼
              目标文件/模块是否已知？
                    ╱     ╲
                  是       否
                  │         │
                  │         ▼
                  │    list_dir + 1~2 次定向 read
                  │         │
                  │         ▼
                  │    仍缺信息且子问题可表述？
                  │      ╱     ╲
                  │    否       是 ──► T1/T4? ──是──► run_subagent(explore)
                  │    │                      否
                  ▼    ▼                      │
            read/patch/verify ◄────────────────┘
                  │
                  ▼
         用户要并行/专家？ ──是──► run_subagent(custom|explore)
                  │
                  ▼
         plan mode 且调研很重？ ──是──► explore（可选）
                  │
                  ▼
              主流程继续
```

---

## 4. 内置子代理契约

### 4.1 `explore`（只读侦察）

| 字段 | 值 |
|------|-----|
| role | `explore` |
| mode | `ask` |
| tools | read_file, list_dir, grep, git_*（只读）, lsp_diagnostics, worktree_status/diff |
| maxSteps | **4**（默认） |
| 权限 | spawn 本身：allow；子工具：只读 allow |

**适用**：T1、T3、T4、T5 中的定位/搜索类子问题。

**输入 `task` 示例**（必须具体）：

- ✅ `Trace where PermissionEngine.check is called from CLI to core runtime`
- ✅ `List all test files covering permission-engine and how they are run`
- ❌ `Find bugs in this repo`
- ❌ `Explore the codebase`

**输出 summary 模板**（§5.2）

### 4.2 `plan`（只读规划）

| 字段 | 值 |
|------|-----|
| role | `plan` |
| mode | `plan` |
| tools | 与 explore 相同的只读集 |
| maxSteps | **5**（默认） |
| 权限 | spawn：allow；不可 patch 源码 |

**适用**：

- Plan mode 内：主 agent 需要 **结构化实现方案** 且调研步骤较多
- **不** 替代 `--plan-first` 的整个 plan session
- **不** 替代 `exit_plan_mode` 的用户审批

**输入 `task` 示例**：

- ✅ `Draft implementation steps to add run_subagent allow rules in PermissionEngine`
- ❌ `Plan everything for this project`

### 4.3 Custom（`.agent/agents/*.yaml`）

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 传给 `run_subagent.agentName` |
| `description` | 是 | 主 agent 选择依据 |
| `role` | 否 | `general` 或省略 |
| `mode` | 否 | 默认继承父 session；`permissions.write: false` → ask |
| `tools` | 是 | allowlist；不得默认包含 apply_patch，除非明确需要 |
| `model` | 否 | 省略则继承父 model |

**示例：`code-reviewer`**

```yaml
name: code-reviewer
description: 只读审查 diff 与相关源码，返回风险与建议
mode: ask
tools:
  - read_file
  - grep
  - git_diff
  - git_show
```

Custom 含写工具 → spawn 与写操作均按 PermissionEngine **ask**；只读 custom 与 explore 同级 **allow spawn**。

---

## 5. 输入 / 输出契约

### 5.1 `run_subagent` 参数

| 参数 | 必填 | 规则 |
|------|------|------|
| `agentName` | 是 | `explore` \| `plan` \| custom name |
| `task` | 是 | **一句可验收的子问题**；含范围、产出类型 |
| `context` | 否 | 主 session 已知线索（路径、分支、已读结论） |
| `maxSteps` | 否 | 不得超过 builtin 默认 +2；custom 以 yaml 为准 |

### 5.2 子代理输出（summary）格式

子代理 final text **应** 遵循（主 agent 与 UI 可依赖此结构）：

```markdown
## Findings
- <结论 1>（`path/to/file:line`）
- <结论 2>

## Evidence
- `path/a.ts` — <一句话>
- `path/b.test.ts` — <一句话>

## Recommendation
<给主 agent 的下一步建议，1~3 条>

## Gaps
<仍不确定、需主 agent 决策的点，无则写 None>
```

约束：

- 总长建议 **≤ 80 行**；禁止粘贴整文件
- 无 findings 时明确写 `No findings`，不要编造

### 5.3 主 agent 消费规则

收到 `run_subagent` tool result 后：

1. **不要** 把 summary 原样当作对用户的 final answer
2. **要** 根据 Recommendation 决定 patch / 继续 explore / 问用户
3. **要** 在 Gaps 非 None 时优先澄清或补读，而不是重复 spawn 同一 task

---

## 6. 硬边界（Must / Must Not）

| 规则 | 说明 |
|------|------|
| **M1** | 子 session `metadata.subagent === true` |
| **M2** | 子 agent **不得** 调用 `run_subagent`（无嵌套） |
| **M3** | 子 agent **不得** 调用 `enter_plan_mode` / `exit_plan_mode` |
| **M4** | builtin explore/plan **不得** apply_patch 源码（plan 子代理不写 plan-draft；那是主 session plan mode 协议） |
| **M5** | 单次 spawn 默认 maxSteps：explore **4**，plan **5** |
| **M6** | child session 须记录 `parentSessionId` |
| **M7** | spawn explore/plan：**permission allow**（不弹 Unknown tool） |
| **M8** | 主 agent 对用户的 **status / effectiveStatus** 仅由主 session finalize |

---

## 7. 与 CollaborationMode 的配合

| Mode | 主流程 | 子代理 |
|------|--------|--------|
| **ask** | 只读问答 | **不提供 run_subagent**；主流程 read/grep（prompt 已对齐） |
| **plan** | 只读 + 产出 plan 文本 | 可选 explore/plan；**不 patch 源码** |
| **edit** | 读 + patch（patch 可 ask） | T1/T3/T4 时 explore；**禁止**子代理 patch |
| **agent** | 自动 patch + verify | 同 edit；spawn 只读 subagent allow |

**Plan mode（in-session）**：主 agent 在 plan mode 下可 spawn explore/plan 做调研；plan 文本写入 **plan-draft** 仍由主 agent 通过 `apply_patch`（仅 draft 路径）+ `exit_plan_mode` 完成。

**--plan-first**：plan session 本身已是隔离 session；仅当 T1/T4 在 plan session 内 spawn explore，execute session **不应** 重复同一 explore task。

---

## 8. 权限策略（spec 层）

与 PermissionEngine 一致：**按能力风险审批，不按「工具名遗漏」默认 Unknown。**

| 动作 | edit | agent | plan mode |
|------|------|-------|-----------|
| spawn `explore` / `plan` | allow | allow | allow |
| spawn 只读 custom | allow | allow | allow |
| spawn 含 write 的 custom | ask | ask（或按 yaml） | deny |
| 子 agent 内 read/grep | allow | allow | allow |
| 子 agent 内 apply_patch | deny | deny | deny |

审批 UI 应展示 **Sub-agent · {name}** + task 摘要，而非 `Unknown tool "run_subagent"`。

---

## 9. 完整 Demo（逻辑闭环）

以下 demo 描述 **期望行为**；CLI 命令见 [user-guide.md](../../user-guide.md)。

### Demo A — 小范围 bug（**不 spawn**，主流程闭环）

**用户**：`请检查 permission-engine 里 run_subagent 为何显示 Unknown tool`

**期望链路**：

```text
Step 1  主：grep "run_subagent" packages/security
Step 2  主：read permission-engine.ts
Step 3  主：read subagent-tool.ts（确认工具已注册）
Step 4  主：结论 — PermissionEngine 未覆盖 run_subagent → default ask
Step 5  主：（若 edit）patch 增加 case + 测试
Step 6  主：pnpm test + 向用户解释
```

**不 spawn 原因**：A1 — 路径已通过 grep 收窄。

---

### Demo B — 广域调研（**spawn explore**）

**用户**：`梳理 code-mind 从 CLI 到 PermissionEngine 的完整审批链路`

**期望链路**：

```text
Step 1  主：list_dir apps/cli packages/core packages/security
Step 2  主：run_subagent(
          agentName: "explore",
          task: "Trace approval flow from CLI permission prompt to PermissionEngine.check and back to tool execution",
          context: "Monorepo roots: apps/cli, packages/core, packages/security"
        )
        ──► child explore session（≤4 steps，只读）
        ──► summary: Findings + 关键文件路径
Step 3  主：按需 spot-read 1~2 文件验证 summary
Step 4  主：向用户输出结构化说明（非 summary 原文）
```

**spawn 原因**：T1 — 跨多 package 的 trace。

---

### Demo C — Plan mode 内调研 + 写 plan（主 + explore，**不 spawn plan 子代理**）

**用户**（edit session）：`先规划如何修复 subagent 权限，再实现`

**期望链路**：

```text
Step 1  主：enter_plan_mode
Step 2  主：run_subagent(explore, "List all permission check entry points for tools in core and security")
Step 3  主：根据 summary 撰写 plan → apply_patch(plan-draft.md only)
Step 4  主：exit_plan_mode(planText) → 用户 REPL/API 审批
Step 5  主：（审批通过后）patch 源码 + test + 总结
```

**边界**：plan 子代理 **可选**；简单 plan 可 Step 2 改为主流程 read。plan **审批**只在 Step 4。

---

### Demo D — `--plan-first`（分 session，避免重复 spawn）

**用户**：`code-mind run "添加 subagent 权限规则" --plan-first --cwd .`

**期望链路**：

```text
Plan session（mode=plan）
  Step 1~N  主：read/grep 或可选 explore(T1)
  Step N    产出 plan markdown → 用户 approve

Execute session（mode=edit，resume 或新 session 带 approved plan）
  Step 1~N  主：按 plan patch + verify
  （不应再 spawn plan 子代理做同一调研）
```

---

### Demo E — Custom reviewer（用户显式委派）

**用户**：`改完后再让 code-reviewer 子代理看一遍 diff`

**期望链路**：

```text
Step 1~K  主：实现 + patch
Step K+1  主：run_subagent(
          agentName: "code-reviewer",
          task: "Review unstaged changes for permission bypass and missing tests",
          context: "Focus packages/security/src/permissions"
        )
Step K+2  主：根据 reviewer summary 决定是否补测试 / 向用户报告
```

**spawn 原因**：T3 — 用户显式要求 reviewer。

---

### Demo F — Anti-pattern（**错误示范**）

**用户**：`请尝试找出一个 bug`

**错误行为**：

```text
Step 1  主：list_dir
Step 2  主：read docs/architecture/packages.md
Step 3  主：run_subagent(explore, "Find bugs")  ← 违反 A3、task 不可验收
```

**正确行为**：

```text
Step 1~3  主：list_dir、读 README/implementation、pnpm test 或 git diff
Step 4    主：若失败测试/可疑模块明确 → 定向 read
Step 5    仅当怀疑跨模块问题 → run_subagent(explore, 具体 trace task)
Step 6    主：定位 + 修复 + 验证 + 向用户说明
```

---

## 10. 事件与可观测性（期望）

实现应对齐以下事件（部分已有，其余为 backlog）：

| 事件 | 时机 |
|------|------|
| `subagent_started` | `run_subagent` 通过权限且 child run 开始 |
| `subagent_finished` | child run 结束，含 success / childSessionId |
| `activity_updated` | 主 session UI 显示 `delegating · explore` |

CLI 进度行示例：

```text
Step 3/12 Delegating · explore
  → Trace approval flow from CLI to PermissionEngine
Step 4/12 Reading · packages/security/...
```

---

## 11. 实现对照清单

| Spec 条目 | 代码位置（public owner） | 状态 |
|-----------|--------------------------|------|
| builtin explore/plan | `packages/capabilities/src/subagent-builtin.ts` | 已有 |
| run_subagent 工具 | `packages/capabilities/src/subagent-tool.ts` | 已有 |
| 子 session 隔离 | `packages/capabilities/src/subagent-manager.ts` | 已有 |
| 禁止 subagent plan mode | `plan-mode.ts` → `canEnterCollaborationPlanMode` | 已有 |
| spawn explore/plan allow | `permission-engine.ts` | **已有** |
| system prompt 委派规则 | `subagent-delegation-block.ts` + `context-manager.ts` | **已有** |
| run_subagent schema 引导 | `subagent-tool.ts` description | **已有** |
| plan-mode attachment 与 spec 一致 | `plan-mode-attachment.ts` | **已有** |
| subagent_* 事件 | `tool-call-handler.ts` + `RuntimeEvent` | **已有** |
| CLI 委派进度文案 | `progress-printer.ts` / `event-lines.ts` / `activity.ts` | **已有** |

---

## 12. 冲突优先级

```text
subagent.md（本 spec）> packages.md（现状）> 模型自行推断
```

当实现与 spec 不一致时，以 **本 spec 为产品目标**，在 [backlog.md](../../backlog.md) 或 PR 中标注差距。

---

## 相关文档

- [packages.md §3 模块归属](../packages.md#3-模块归属禁止重复实现) — SubagentManager 唯一归属
- [file-layout.md §2.3](../file-layout.md#23-packagescore-agent-runtime-编排) — core 编排层职责