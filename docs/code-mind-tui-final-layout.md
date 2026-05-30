# code-mind TUI 最终布局方案

> 设计方向：轻量默认、thinking 流动显示、按需展开、专注结果。  
> 适用范围：`code-mind repl` / interactive mode / terminal user interface。

---

## 1. 设计原则

TUI 默认不做“监控大屏”，而是做一个轻量、可持续交互的 code agent 工作台。

默认只回答用户最关心的几个问题：

1. 当前任务是什么？
2. Agent 计划怎么做？
3. 现在执行到哪一步？
4. 最近发生了什么？
5. 需要我输入、审批或展开什么？

信息层级：

```text
默认主视图
  只显示当前任务、计划、最近活动、输入框。

选中展开
  查看 thinking、tool result、diff、error。

slash command
  查看 status、context、permissions、reasoning summary。

verbose / trace
  查看完整工具结果、token、ctx、耗时、事件流。
```

一句话原则：

```text
默认界面保持轻；thinking 流动显示；详细信息通过 Enter 或 slash command 展开。
```

---

## 2. 默认 TUI 主布局

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ code-mind   mode: edit   model: deepseek   git: main clean   step 4/6  ● run │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ user                                                                         │
│   fix failing parser tests                                                   │
│                                                                              │
│ assistant                                                                    │
│   I’ll reproduce the failure, inspect the parser, patch the smallest safe     │
│   fix, and run focused validation.                                            │
│                                                                              │
│ Plan                                                                         │
│   ✓ 1. Locate test command                                                    │
│   ✓ 2. Reproduce failure                                                      │
│   ✓ 3. Inspect failing module                                                 │
│   → 4. Reason about root cause                                                │
│   · 5. Patch smallest safe fix                                                │
│   · 6. Run focused validation                                                 │
│                                                                              │
│ Activity                                                                     │
│   ✓ read_file      package.json                              12ms             │
│   × run_shell      pnpm test                                 exit 1 · 8.2s    │
│   ✓ read_file      src/utils/parser.ts                       9ms              │
│ > … thinking      comparing expected vs actual behavior       [enter expand] │
│                                                                              │
│   … 3 more events ›                                                          │
│                                                                              │
│ Hints: /status  /diff  /reason  /permissions  /model  /help                  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ › Type a task or command...                                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 默认保留区域

默认只显示 5 个区域：

```text
Top Status
Conversation
Plan
Activity
Input Composer
```

不默认显示：

```text
Context 面板
Tokens
完整工具结果
完整 reasoning
右侧说明栏
Shortcuts 大表格
Live stdout 大窗口
```

这些内容通过命令、选中展开或 verbose 模式查看。

---

## 4. Thinking 流动显示

Thinking 是 Activity 里的特殊行，而不是独立大面板。

默认显示为：

```text
Activity
  ✓ read_file      package.json                    12ms
  × run_shell      pnpm test                       exit 1 · 8.2s
  ✓ read_file      src/utils/parser.ts             9ms
> … thinking       comparing expected vs actual behavior       [enter expand]
```

Thinking 状态可以实时变化：

```text
… thinking · reading failure output
… thinking · comparing expected vs actual behavior
… thinking · forming hypothesis
… thinking · checking smallest safe fix
```

默认不展示完整推理链，只显示当前思考阶段。

---

## 5. Thinking 展开态

用户选中 thinking 行并按 Enter：

```text
┌─ Thinking ───────────────────────────────────────────────────────────────────┐
│ Current focus                                                                │
│   Comparing parser behavior with the failing test expectation.               │
│                                                                              │
│ Hypothesis                                                                   │
│   Empty input and nullish input are handled inconsistently.                   │
│                                                                              │
│ Next action                                                                  │
│   Check whether a narrow guard before tokenization is enough.                 │
│                                                                              │
│ Actions                                                                      │
│   r reason summary   e evidence   q close                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

说明：

- 这是轻量展开。
- 不展示完整原始 thinking。
- 展示用户可理解的当前焦点、假设和下一步。

---

## 6. Reasoning Summary 展开态

输入 `/reason`，或在 Thinking 展开态按 `r`：

```text
┌─ Reasoning Summary · step 4 ─────────────────────────────────────────────────┐
│ Hypothesis                                                                   │
│   Empty input and null input are handled inconsistently.                      │
│                                                                              │
│ Evidence                                                                     │
│   - Failing test expects an empty token list.                                 │
│   - Current implementation throws before tokenization.                        │
│   - No related tests require throwing for nullish input.                      │
│                                                                              │
│ Decision                                                                     │
│   Add a narrow nullish guard before tokenization.                             │
│                                                                              │
│ Alternative considered                                                       │
│   Change the test expectation.                                                │
│   Rejected because behavior would be inconsistent with nearby cases.          │
│                                                                              │
│ q close   e evidence   d diff                                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

命名建议：

```text
推荐：Reasoning Summary / 推理摘要 / 决策依据 / 分析摘要
不推荐：Full Thinking / Detailed Chain of Thought
```

产品原则：

```text
默认显示 thinking 状态；
展开显示可审计的推理摘要；
不默认暴露完整原始推理链。
```

---

## 7. Diff 展开态

输入 `/diff`：

```text
┌─ Diff · 1 file changed ──────────────────────────────────────────────────────┐
│ src/utils/parser.ts                                                          │
│                                                                              │
│ @@ -42,6 +42,9 @@ export function parse(input: string | null | undefined) {   │
│ -  if (input == null) {                                                       │
│ -    throw new Error("input required");                                       │
│ -  }                                                                         │
│ +  if (input == null) {                                                       │
│ +    return [];                                                              │
│ +  }                                                                         │
│                                                                              │
│ q close   a accept   r revert   o open file                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Status 展开态

输入 `/status`：

```text
┌─ Status ─────────────────────────────────────────────────────────────────────┐
│ Task           fix failing parser tests                                      │
│ Mode           edit                                                          │
│ Model          deepseek                                                      │
│ Workspace      ~/workspace/agent-study/code-mind                             │
│ Git            main clean                                                    │
│ Step           4 / 6                                                         │
│ Status         running                                                       │
│ Files read     3                                                             │
│ Files changed  0                                                             │
│ Commands run   1                                                             │
│ Permissions    files rw · commands ask · network off                         │
│                                                                              │
│ q close                                                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Approval 弹层

当需要审批时，主界面不应被完全刷掉，而是显示一个居中的 modal：

```text
┌─ Approval required ──────────────────────────────────────────────────────────┐
│ Agent wants to run                                                           │
│   pnpm install                                                               │
│                                                                              │
│ Purpose                                                                      │
│   Install dependencies required to run tests.                                 │
│                                                                              │
│ Risk                                                                         │
│   - Downloads packages from the network.                                      │
│   - May update lockfile.                                                      │
│   - May execute package lifecycle scripts.                                    │
│                                                                              │
│ Options                                                                      │
│   y allow once    a always allow this kind    n deny    e explain             │
└──────────────────────────────────────────────────────────────────────────────┘
```

底部输入区变成：

```text
approval required ›
```

---

## 10. 错误提示

错误不要占大面积，默认显示紧凑卡片：

```text
┌─ Command failed ─────────────────────────────────────────────────────────────┐
│ pnpm test                                                                    │
│ exit code: 1                                                                 │
│                                                                              │
│ Hint                                                                         │
│   Parser tests failed. Use /expand to see output or continue debugging.       │
└──────────────────────────────────────────────────────────────────────────────┘
```

文件不存在：

```text
┌─ File not found ─────────────────────────────────────────────────────────────┐
│ src/missing.ts                                                               │
│                                                                              │
│ Hint                                                                         │
│   The referenced file does not exist. Use /context or continue inspection.    │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. 键盘交互

```text
↑ / ↓       选择 activity / plan item
Enter       展开当前选中项
q           关闭展开面板
/           输入命令
Tab         补全命令
Ctrl+C      中断当前操作
Ctrl+L      清屏
```

---

## 12. 常用命令

```text
/status        查看当前状态
/context       查看上下文、文件、tokens
/diff          查看文件变更
/reason        查看推理摘要
/expand        展开最近事件
/permissions   查看权限策略
/model         切换或查看模型
/approvals     查看审批历史
/verbose       切换详细模式
/help          查看帮助
```

---

## 13. 输入样式

### 普通自然语言输入

```text
› fix failing parser tests
```

### Slash command

```text
› /status
› /diff
› /reason
```

### 多行任务输入，可选

```text
› /edit-task
# Task
Fix failing parser tests.

# Goal
All parser tests pass.

# Constraints
- Keep fix minimal.
- Do not change public API.
- Ask before broad test suites.
```

---

## 14. Verbose / Trace 分层

### 默认模式

显示：

```text
任务
计划
最近活动
thinking 当前状态
输入框
```

### `/verbose`

额外显示：

```text
完整工具行
工具结果摘要
reasoning summary
更多历史事件
```

### `--trace`

额外显示：

```text
ctx/token
耗时
reasoning chars
事件时间线
```

### `--debug`

额外显示：

```text
原始 AgentEvent
内部 process.log
完整 debug metadata
```

---

## 15. 最终产品心智

```text
Input
  用户输入自然语言任务或 slash command。

Plan
  Agent 给出简短计划，并在执行中展示进度。

Thinking
  作为流动 activity 行实时显示。

Expand
  用户选中 thinking、tool、diff、error 后按 Enter 查看详情。

Result
  Agent 输出最终结果、变更、验证和下一步。
```

核心体验：

```text
Conversation first.
Progress visible.
Thinking live.
Details on demand.
```
