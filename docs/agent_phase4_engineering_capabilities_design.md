# 第四阶段：工程能力增强设计文档

> 阶段：Phase 4  
> 主题：Engineering Capabilities Enhancement  
> 技术栈：TypeScript / Node.js  
> 前置条件：阶段一最小闭环、阶段二多模型、阶段三权限安全与上下文管理已完成  
> 阶段目标：让 Agent 从“安全可控的工具执行器”升级为“真正适合代码工程任务的开发助手”。

---

## 1. 阶段四目标

阶段一解决：

```text
最小 Agent Loop
读文件 / 搜索 / 修改 / 执行测试
```

阶段二解决：

```text
多模型 Provider
Tool Call Normalizer
Model Router
Fallback
```

阶段三解决：

```text
权限
安全
上下文
Session
审计
Prompt Injection 防护
```

阶段四要解决的是：

> Agent 如何更像一个真实工程师：先分析、再计划、隔离修改、运行测试、理解错误、审查 diff、迭代修复。

阶段四需要完成：

```text
1. Plan Mode
2. Git 工具增强
3. Worktree 隔离
4. Test Runner
5. LSP / 代码智能工具
6. Review Agent 初版
7. Error Recovery
8. Patch Planner
9. Verification Pipeline
10. Task State Machine
11. 工程任务模板
12. 大型修改分阶段执行
```

---

## 2. 阶段四不做什么

阶段四仍然不做平台化扩展能力。

暂时不要做：

```text
1. MCP 完整平台
2. Skills 完整市场
3. Subagents 完整多角色协作
4. Web UI
5. VS Code 插件完整实现
6. 企业 RBAC 后台
7. 多用户协同
8. 插件市场
9. CI/CD Bot 完整部署
```

阶段四专注于：

> 单项目代码工程任务能力增强。

---

## 3. 阶段四完成后的效果

完成后，用户可以执行：

```bash
agent --mode plan "重构 auth 模块，把 token 校验逻辑拆出来"
```

Agent 应该：

```text
1. 只读分析相关文件
2. 生成修改计划
3. 展示将修改哪些文件
4. 等用户确认
5. 创建隔离 worktree 或修改分支
6. 分阶段 apply_patch
7. 每阶段运行测试
8. 失败后读取错误日志并修复
9. 最后运行 lint/build/test
10. 审查最终 diff
11. 输出完整总结
```

---

# 4. 阶段四总体架构

阶段四会在 Runtime 旁边增加工程能力层。

```text
┌──────────────────────────────────────────────────────────────┐
│                    Agent Runtime Core                        │
│ Agent Loop / Context / Permission / Tool Runtime / Audit      │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                 Engineering Capability Layer                 │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ Plan Manager     │  │ Task State Machine│                 │
│  └──────────────────┘  └──────────────────┘                 │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ Git Manager      │  │ Worktree Manager │                 │
│  └──────────────────┘  └──────────────────┘                 │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ Test Runner      │  │ LSP Adapter      │                 │
│  └──────────────────┘  └──────────────────┘                 │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ Review Engine    │  │ Recovery Engine  │                 │
│  └──────────────────┘  └──────────────────┘                 │
└──────────────────────────────────────────────────────────────┘
```

---

# 5. Plan Mode 设计

## 5.1 目标

Plan Mode 的核心是：

> 复杂任务先只读分析并生成计划，用户确认后再执行。

它可以避免 Agent 一上来就修改代码。

---

## 5.2 Plan Mode 流程

```text
用户输入复杂任务
      ↓
进入 Plan Mode
      ↓
只读工具开放：
  - list_dir
  - read_file
  - grep
  - git_status
  - git_diff
  - lsp_symbol_search
      ↓
Agent 分析代码
      ↓
生成 Plan
      ↓
用户确认
      ↓
切换 Execute Mode
      ↓
执行修改
```

---

## 5.3 Plan 数据结构

```ts
export interface AgentPlan {
  id: string;
  task: string;
  summary: string;
  riskLevel: RiskLevel;
  affectedFiles: PlannedFileChange[];
  steps: PlanStep[];
  verification: VerificationStep[];
  rollback?: RollbackPlan;
}
```

---

## 5.4 PlannedFileChange

```ts
export interface PlannedFileChange {
  path: string;
  action: "read" | "modify" | "create" | "delete";
  reason: string;
  riskLevel: RiskLevel;
}
```

---

## 5.5 PlanStep

```ts
export interface PlanStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  expectedFiles?: string[];
  verification?: string[];
}
```

---

## 5.6 VerificationStep

```ts
export interface VerificationStep {
  command?: string;
  tool?: string;
  description: string;
  required: boolean;
}
```

---

## 5.7 Plan 输出示例

```md
# 修改计划

## 任务

重构 auth 模块，把 token 校验逻辑拆出来。

## 影响文件

- `src/auth/index.ts`：调用新的 token 校验函数
- `src/auth/token.ts`：新增 token 校验函数
- `tests/auth.test.ts`：补充测试

## 执行步骤

1. 新建 `src/auth/token.ts`
2. 将 `validateToken` 逻辑从 `index.ts` 拆出
3. 修改 `index.ts` 引用
4. 补充 token 单元测试
5. 运行 `npm test`

## 风险

中等风险：涉及认证逻辑，需要确保测试覆盖。

## 验证

- `npm test`
- `npm run lint`
```

---

## 5.8 Plan Mode 权限

Plan Mode 下：

允许：

```text
list_dir
read_file
grep
git_status
git_diff
git_log
lsp_symbol_search
```

禁止：

```text
apply_patch
write_file
run_shell 写操作
npm install
git commit
git push
```

可选允许：

```text
npm test -- --dry-run
tsc --noEmit
```

---

# 6. Task State Machine

## 6.1 目标

复杂任务不能只靠字符串状态。

需要明确状态机：

```text
created
  ↓
planning
  ↓
awaiting_approval
  ↓
executing
  ↓
verifying
  ↓
reviewing
  ↓
completed
```

失败状态：

```text
failed
cancelled
rolled_back
needs_user_input
```

---

## 6.2 状态定义

```ts
export type TaskStatus =
  | "created"
  | "planning"
  | "awaiting_approval"
  | "executing"
  | "verifying"
  | "reviewing"
  | "completed"
  | "failed"
  | "cancelled"
  | "rolled_back"
  | "needs_user_input";
```

---

## 6.3 状态转移

```text
created → planning
planning → awaiting_approval
awaiting_approval → executing
awaiting_approval → cancelled
executing → verifying
executing → failed
verifying → reviewing
verifying → executing
reviewing → completed
reviewing → executing
```

---

## 6.4 状态记录

```json
{
  "taskId": "task_001",
  "status": "executing",
  "currentStep": "step_3",
  "planId": "plan_001",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

---

# 7. Git 工具增强

## 7.1 阶段四新增 Git 工具

阶段三已有基础 git_status / git_diff。

阶段四增强为：

```text
git_status
git_diff
git_log
git_branch
git_show
git_blame
git_changed_files
git_restore_file
git_create_branch
```

---

## 7.2 git_status

### 用途

获取当前工作区状态。

### 返回

```text
branch: main
clean: false

modified:
  - src/math.ts

untracked:
  - src/auth/token.ts
```

---

## 7.3 git_diff

### 用途

查看当前 diff。

### 参数

```ts
interface GitDiffArgs {
  path?: string;
  staged?: boolean;
}
```

---

## 7.4 git_changed_files

### 用途

获取修改文件列表，供 Review Engine 使用。

### 返回

```json
{
  "modified": ["src/auth/index.ts"],
  "created": ["src/auth/token.ts"],
  "deleted": [],
  "untracked": ["tests/auth.test.ts"]
}
```

---

## 7.5 git_restore_file

### 用途

回滚某个文件。

### 权限

默认 ask。

```yaml
permissions:
  git:
    ask:
      - "restore_file"
```

---

## 7.6 Git 安全边界

默认禁止：

```text
git push
git reset --hard
git clean -fd
git rebase
git filter-branch
```

默认 ask：

```text
git checkout -b
git commit
git restore
```

默认 allow：

```text
git status
git diff
git log
git show
```

---

# 8. Worktree Manager 设计

## 8.1 为什么需要 Worktree

复杂修改风险较高，直接修改主工作区容易破坏用户当前状态。

Worktree 可以隔离 Agent 修改：

```text
main worktree:
  用户当前工作区

agent worktree:
  Agent 实验修改
```

---

## 8.2 Worktree 流程

```text
用户确认 Plan
      ↓
创建 agent worktree
      ↓
Agent 在 worktree 中修改
      ↓
运行测试
      ↓
生成 diff
      ↓
用户选择：
  - 应用到主工作区
  - 保留 worktree
  - 删除 worktree
```

---

## 8.3 Worktree 目录

```text
.agent/worktrees/
├── task_001/
│   └── repo/
└── task_002/
    └── repo/
```

或者使用 Git 原生命令：

```bash
git worktree add .agent/worktrees/task_001 -b agent/task_001
```

---

## 8.4 Worktree 工具

```text
worktree_create
worktree_enter
worktree_status
worktree_diff
worktree_apply_to_main
worktree_cleanup
```

---

## 8.5 WorktreeCreateArgs

```ts
export interface WorktreeCreateArgs {
  taskId: string;
  branchName?: string;
  baseRef?: string;
}
```

---

## 8.6 权限

创建 worktree 默认 ask。

```yaml
permissions:
  worktree:
    ask:
      - "create"
      - "apply_to_main"
    allow:
      - "status"
      - "diff"
    deny:
      - "cleanup_unconfirmed"
```

---

## 8.7 阶段四实现建议

阶段四可以先实现简化版：

```text
1. 创建 worktree
2. 在 worktree 中执行修改
3. 查看 worktree diff
4. 手动提示用户如何应用
```

暂时不自动 merge 回主工作区。

---

# 9. Test Runner 设计

## 9.1 目标

让 Agent 不再只会执行任意 `run_shell`，而是理解测试命令、测试结果和失败摘要。

---

## 9.2 Test Runner 职责

```text
1. 从 package.json / pyproject.toml / Cargo.toml / go.mod 识别项目类型
2. 识别测试命令
3. 执行测试
4. 解析失败输出
5. 提取错误摘要
6. 生成下一轮修复上下文
```

---

## 9.3 支持项目类型

阶段四优先支持：

```text
Node.js / TypeScript
Python
Rust
Go
```

---

## 9.4 测试命令发现

### Node.js

读取 `package.json`：

```json
{
  "scripts": {
    "test": "vitest",
    "lint": "eslint .",
    "build": "tsc -p tsconfig.json"
  }
}
```

识别：

```text
npm test
npm run lint
npm run build
```

---

### Python

检测：

```text
pytest.ini
pyproject.toml
tests/
```

命令：

```text
pytest
python -m pytest
```

---

### Rust

检测：

```text
Cargo.toml
```

命令：

```text
cargo test
cargo check
```

---

### Go

检测：

```text
go.mod
```

命令：

```text
go test ./...
```

---

## 9.5 TestRunner 接口

```ts
export interface TestRunner {
  detect(projectPath: string): Promise<TestProfile>;

  run(args: RunTestArgs): Promise<TestResult>;

  parseOutput(output: string): Promise<TestFailureSummary>;
}
```

---

## 9.6 TestProfile

```ts
export interface TestProfile {
  language: "typescript" | "python" | "rust" | "go" | "unknown";
  framework?: string;
  commands: {
    test?: string;
    lint?: string;
    build?: string;
    typecheck?: string;
  };
}
```

---

## 9.7 TestResult

```ts
export interface TestResult {
  success: boolean;
  command: string;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  summary: TestFailureSummary;
}
```

---

## 9.8 TestFailureSummary

```ts
export interface TestFailureSummary {
  failedTests: FailedTest[];
  errorMessages: string[];
  likelyFiles: string[];
  rawExcerpt: string;
}
```

---

## 9.9 FailedTest

```ts
export interface FailedTest {
  name: string;
  file?: string;
  message: string;
  expected?: string;
  received?: string;
}
```

---

## 9.10 输出给模型的测试摘要

不要把完整日志全部塞进上下文。

应输出：

```md
# Test Failed

Command: npm test
Exit Code: 1

## Failed Tests

- tests/math.test.ts > add > adds two numbers
  - expected: 3
  - received: -1

## Likely Files

- src/math.ts
- tests/math.test.ts

## Relevant Error Excerpt

expect(received).toBe(expected)
Expected: 3
Received: -1
```

---

# 10. LSP Adapter 设计

## 10.1 目标

让 Agent 不只靠 grep，而是能获取代码语义信息。

阶段四先实现轻量 LSP Adapter。

---

## 10.2 能力范围

阶段四优先支持：

```text
1. 查找 symbol
2. 跳转 definition
3. 查找 references
4. 获取 diagnostics
5. 获取 document symbols
```

---

## 10.3 工具列表

```text
lsp_document_symbols
lsp_workspace_symbols
lsp_definition
lsp_references
lsp_diagnostics
```

---

## 10.4 lsp_document_symbols

### 参数

```ts
interface LspDocumentSymbolsArgs {
  path: string;
}
```

### 返回示例

```json
{
  "symbols": [
    {
      "name": "add",
      "kind": "Function",
      "range": {
        "startLine": 1,
        "endLine": 3
      }
    }
  ]
}
```

---

## 10.5 lsp_definition

### 参数

```ts
interface LspDefinitionArgs {
  path: string;
  line: number;
  character: number;
}
```

---

## 10.6 lsp_diagnostics

### 用途

获取 TypeScript / Python / Rust 等语言错误。

返回示例：

```json
{
  "diagnostics": [
    {
      "path": "src/main.ts",
      "line": 10,
      "message": "Type 'string' is not assignable to type 'number'",
      "severity": "error"
    }
  ]
}
```

---

## 10.7 阶段四实现建议

LSP 实现成本较高，可以分两步：

### Step 1：TypeScript 专用实现

直接调用：

```bash
npx tsc --noEmit
```

解析错误输出。

### Step 2：接入通用 LSP

后续使用：

```text
vscode-languageserver-protocol
typescript-language-server
pyright
rust-analyzer
gopls
```

阶段四建议：

```text
先实现 lsp_diagnostics，其他接口可以预留。
```

---

# 11. Review Engine 设计

## 11.1 目标

Agent 修改完代码后，不应直接宣称完成，而应自查。

Review Engine 负责：

```text
1. 获取当前 diff
2. 检查是否符合用户任务
3. 检查是否改错文件
4. 检查是否引入明显风险
5. 检查是否需要补测试
6. 输出 review 结论
```

---

## 11.2 Review 输入

```ts
export interface ReviewInput {
  task: string;
  plan?: AgentPlan;
  changedFiles: string[];
  diff: string;
  testResults: TestResult[];
  projectRules?: string;
}
```

---

## 11.3 Review 输出

```ts
export interface ReviewResult {
  passed: boolean;
  issues: ReviewIssue[];
  suggestions: string[];
  requiresAnotherIteration: boolean;
}
```

---

## 11.4 ReviewIssue

```ts
export interface ReviewIssue {
  severity: "info" | "warning" | "error";
  file?: string;
  line?: number;
  message: string;
}
```

---

## 11.5 Review 流程

```text
代码修改完成
      ↓
git_diff
      ↓
Test Runner 执行测试
      ↓
Review Engine 调模型审查 diff
      ↓
如果有 error：
  回到 Agent Loop 继续修复
如果只有 warning：
  输出给用户
如果 passed：
  完成任务
```

---

## 11.6 Review Prompt 样例

```text
你是代码审查 Agent。
请审查下面的 diff 是否正确完成用户任务。

用户任务：
{{task}}

修改计划：
{{plan}}

当前 diff：
{{diff}}

测试结果：
{{test_results}}

请检查：
1. 是否完成任务
2. 是否引入明显 bug
3. 是否修改了无关文件
4. 是否需要补充测试
5. 是否有安全风险

输出 JSON：
{
  "passed": true,
  "issues": [],
  "requiresAnotherIteration": false
}
```

---

# 12. Error Recovery 设计

## 12.1 目标

Agent 执行失败时不能简单退出。

需要根据错误类型做恢复。

---

## 12.2 错误类型

```text
1. Model Error
2. Tool Error
3. Patch Error
4. Test Failure
5. Permission Denied
6. Context Overflow
7. Shell Timeout
8. User Rejected
```

---

## 12.3 Recovery 策略

### Model Error

```text
1. retry
2. fallback model
3. 压缩上下文后重试
```

---

### Patch Error

```text
1. 重新读取目标文件
2. 生成更小 patch
3. 使用 search/replace 模式
4. 如果仍失败，询问用户
```

---

### Test Failure

```text
1. 解析测试失败摘要
2. 读取 likely files
3. 继续一轮修复
4. 限制最大修复次数
```

---

### Permission Denied

```text
1. 不尝试绕过
2. 将 deny reason 回填模型
3. 要求模型选择安全替代方案
```

---

### Shell Timeout

```text
1. 截断输出
2. 提示超时
3. 询问是否增加 timeout
4. 或选择更小测试范围
```

---

### User Rejected

```text
1. 停止当前修改
2. 询问是否生成替代方案
3. 不重复提交相同 patch
```

---

## 12.4 Recovery 限制

避免无限循环：

```yaml
recovery_limits:
  max_patch_retries: 3
  max_test_fix_iterations: 3
  max_model_retries: 2
  max_total_steps: 30
```

---

# 13. Verification Pipeline

## 13.1 目标

每个修改任务都应该有验证流程。

---

## 13.2 验证阶段

```text
1. Static Check
2. Unit Test
3. Lint
4. Build
5. Review
```

---

## 13.3 默认策略

根据项目能力自动选择：

```text
如果 package.json 有 test → npm test
如果 package.json 有 lint → npm run lint
如果 package.json 有 build → npm run build
如果 tsconfig.json 存在 → tsc --noEmit
如果 pytest 可用 → pytest
```

---

## 13.4 VerificationResult

```ts
export interface VerificationResult {
  passed: boolean;
  steps: VerificationStepResult[];
  summary: string;
}
```

---

## 13.5 VerificationStepResult

```ts
export interface VerificationStepResult {
  name: string;
  command?: string;
  success: boolean;
  exitCode?: number;
  durationMs?: number;
  summary: string;
}
```

---

# 14. Patch Planner

## 14.1 目标

大型修改不要一次生成巨大 patch。

Patch Planner 把计划拆成多个小 patch。

---

## 14.2 PatchPlan

```ts
export interface PatchPlan {
  planId: string;
  patches: PlannedPatch[];
}
```

---

## 14.3 PlannedPatch

```ts
export interface PlannedPatch {
  id: string;
  description: string;
  targetFiles: string[];
  dependencies: string[];
  verification?: string[];
}
```

---

## 14.4 执行流程

```text
生成总计划
      ↓
拆分 patch
      ↓
执行 patch 1
      ↓
验证
      ↓
执行 patch 2
      ↓
验证
      ↓
最终 review
```

---

# 15. 工程任务模板

阶段四可以引入任务模板，让 Agent 更稳定。

## 15.1 Bug Fix Template

```text
1. 运行测试或读取错误日志
2. 定位失败测试
3. 搜索相关函数
4. 读取实现和测试
5. 修改最小代码
6. 运行相关测试
7. 审查 diff
8. 输出总结
```

---

## 15.2 Refactor Template

```text
1. 进入 Plan Mode
2. 分析引用关系
3. 生成重构计划
4. 用户确认
5. 分小 patch 修改
6. 每阶段验证
7. 最终全量测试
8. 审查 diff
```

---

## 15.3 Add Feature Template

```text
1. 分析现有结构
2. 找到类似实现
3. 生成功能计划
4. 修改代码
5. 补测试
6. 运行测试
7. 输出使用说明
```

---

## 15.4 Code Review Template

```text
1. 获取 git diff
2. 分析变更文件
3. 检查正确性
4. 检查安全风险
5. 检查可维护性
6. 检查测试覆盖
7. 输出分级问题
```

---

# 16. 配置设计

## 16.1 工程能力配置

`.agent/settings.yaml`

```yaml
engineering:
  plan_mode:
    require_for_large_changes: true
    large_change_file_threshold: 5
    large_change_line_threshold: 200

  verification:
    run_tests_after_patch: true
    run_lint_after_patch: true
    run_build_before_finish: false
    max_test_fix_iterations: 3

  worktree:
    enabled: true
    require_for_large_changes: true
    base_dir: ".agent/worktrees"

  review:
    enabled: true
    require_before_finish: true
    model: "claude-sonnet"

  lsp:
    enabled: true
    diagnostics_first: true
```

---

## 16.2 命令配置

```yaml
commands:
  test: "npm test"
  lint: "npm run lint"
  build: "npm run build"
  typecheck: "npx tsc --noEmit"
```

---

# 17. CLI 设计

## 17.1 Plan Mode

```bash
agent --mode plan "重构 auth 模块"
```

输出计划后询问：

```text
Approve this plan? [y/N]
```

---

## 17.2 自动执行计划

```bash
agent --mode auto-edit --plan "重构 auth 模块"
```

含义：

```text
先生成计划，确认后执行。
```

---

## 17.3 Worktree

```bash
agent --worktree "实现用户登录功能"
```

---

## 17.4 Review

```bash
agent review
agent review --diff
agent review --since main
```

---

## 17.5 Verify

```bash
agent verify
agent verify --test
agent verify --lint
agent verify --build
```

---

# 18. Session 目录增强

阶段四 Session 增加：

```text
.agent/sessions/<session-id>/
├── plan.md
├── plan.json
├── task-state.json
├── verification.json
├── review.json
├── worktree.json
├── test-results/
│   ├── test-001.json
│   └── test-002.json
├── lsp/
│   └── diagnostics.json
└── recovery-events.jsonl
```

---

# 19. 阶段四开发任务拆分

## Task 1：实现 Task State Machine

### 需要完成

```text
1. 定义 TaskStatus
2. 定义状态转移
3. Session 中保存 task-state.json
4. CLI 输出当前状态
```

### 验证

```text
created → planning → awaiting_approval → executing → verifying → reviewing → completed
```

---

## Task 2：实现 Plan Manager

### 需要完成

```text
1. Plan Mode
2. 只读权限
3. 生成 Plan JSON / Markdown
4. 用户确认
5. 执行计划
```

### 验证

复杂任务必须先输出 plan，不直接修改文件。

---

## Task 3：增强 Git 工具

### 需要完成

```text
git_status
git_diff
git_log
git_changed_files
git_show
git_restore_file
```

### 验证

能准确获取当前修改文件和 diff。

---

## Task 4：实现 Worktree Manager 简版

### 需要完成

```text
1. 创建 worktree
2. 在 worktree 中执行 Agent
3. 查看 worktree diff
4. 清理 worktree
```

### 验证

主工作区不被修改，worktree 中产生 diff。

---

## Task 5：实现 Test Runner

### 需要完成

```text
1. 检测项目类型
2. 识别 test/lint/build 命令
3. 执行测试
4. 解析失败摘要
5. 输出 TestResult
```

### 验证

TypeScript demo 项目测试失败能解析 expected/received。

---

## Task 6：实现 LSP Diagnostics 简版

### 需要完成

```text
1. TypeScript: npx tsc --noEmit
2. 解析 TS 错误
3. 输出 diagnostics
```

### 验证

TS 类型错误能定位文件和行号。

---

## Task 7：实现 Review Engine

### 需要完成

```text
1. 获取 diff
2. 获取测试结果
3. 调模型审查
4. 输出 ReviewResult
5. 如果 error，进入下一轮修复
```

### 验证

故意引入错误 diff，Review 能发现。

---

## Task 8：实现 Error Recovery

### 需要完成

```text
1. PatchError retry
2. TestFailure retry
3. ModelError fallback
4. PermissionDenied 安全替代
5. ShellTimeout 处理
```

### 验证

测试失败后 Agent 能继续修复一次。

---

## Task 9：实现 Verification Pipeline

### 需要完成

```text
1. run test
2. run lint
3. run build
4. 汇总 VerificationResult
```

### 验证

任务完成前自动验证。

---

## Task 10：实现工程任务模板

### 需要完成

```text
bug_fix
refactor
add_feature
code_review
write_tests
```

### 验证

不同任务类型使用不同流程。

---

# 20. 阶段四测试用例

## 20.1 Plan Mode 测试

### 用户任务

```text
重构 auth 模块，把 token 校验逻辑拆出来
```

### 期望

```text
1. Agent 只读分析
2. 输出计划
3. 未确认前不修改文件
4. 用户确认后才执行
```

---

## 20.2 Worktree 隔离测试

### 命令

```bash
agent --worktree "修复测试失败"
```

### 期望

```text
1. 创建 worktree
2. 主工作区不变
3. worktree 中修改文件
4. 可以查看 worktree diff
```

---

## 20.3 Test Runner 失败摘要测试

### 测试输出

```text
Expected: 3
Received: -1
```

### 期望

```json
{
  "failedTests": [
    {
      "expected": "3",
      "received": "-1"
    }
  ],
  "likelyFiles": ["src/math.ts"]
}
```

---

## 20.4 TypeScript Diagnostics 测试

### 文件

```ts
const x: number = "abc";
```

### 期望

```text
diagnostics:
  file: src/main.ts
  message: Type 'string' is not assignable to type 'number'
```

---

## 20.5 Review Engine 测试

### 场景

Agent 修改了 `src/math.ts`，但没有补测试。

### 期望

```text
Review 输出 warning:
  建议补充测试
```

---

## 20.6 Error Recovery 测试

### 场景

第一次 patch 后测试失败。

### 期望

```text
1. Agent 解析失败
2. 读取相关文件
3. 生成第二次 patch
4. 再次运行测试
5. 成功或达到最大修复次数
```

---

## 20.7 Verification Pipeline 测试

### 项目 package.json

```json
{
  "scripts": {
    "test": "vitest",
    "lint": "eslint .",
    "build": "tsc -p tsconfig.json"
  }
}
```

### 期望

```text
任务完成前依次运行 test / lint / build。
```

---

# 21. 阶段四集成测试

## 21.1 完整 Bug Fix 流程

任务：

```text
修复测试失败
```

期望：

```text
1. 运行测试
2. 解析失败
3. 修改代码
4. 再运行测试
5. Review diff
6. 输出总结
```

---

## 21.2 完整 Refactor 流程

任务：

```text
重构 auth 模块
```

期望：

```text
1. 进入 Plan Mode
2. 生成计划
3. 用户确认
4. 创建 worktree
5. 分阶段 patch
6. 每阶段验证
7. 最终 review
```

---

## 21.3 Code Review 流程

命令：

```bash
agent review --diff
```

期望：

```text
1. 获取 git diff
2. 分析变更
3. 输出问题列表
4. 不修改代码
```

---

# 22. 阶段四验收标准

## 22.1 必须满足

```text
1. 支持 Plan Mode
2. Plan Mode 下不会修改文件
3. 支持用户确认计划后执行
4. 支持 git_status / git_diff / git_changed_files
5. 支持 Test Runner
6. 能解析测试失败摘要
7. 支持 TypeScript diagnostics 简版
8. 支持 Review Engine 初版
9. 支持 Error Recovery 初版
10. 支持 Verification Pipeline
11. 支持 Worktree 简版或至少预留完整接口
12. 任务状态可持久化
```

---

## 22.2 可以暂时不满足

```text
1. 完整 LSP 多语言支持
2. 自动 merge worktree 到主分支
3. 完整多 Subagent 协作
4. 自动创建 PR
5. 复杂冲突解决
6. 分布式任务执行
7. 企业审批流
```

---

# 23. 推荐开发顺序

```text
1. Task State Machine
2. Plan Manager
3. Git 工具增强
4. Test Runner
5. Verification Pipeline
6. Error Recovery
7. Review Engine
8. LSP Diagnostics 简版
9. Worktree Manager
10. Patch Planner
11. 工程任务模板
12. 集成测试
```

---

# 24. 阶段四风险点

## 24.1 Plan 过度复杂

Plan 不要一开始做成项目管理系统。

第一版只需要：

```text
summary
affectedFiles
steps
verification
riskLevel
```

---

## 24.2 Test Runner 解析不稳定

不同测试框架输出差异很大。

解决：

```text
1. 先支持 Vitest / Jest / pytest 常见格式
2. 解析失败则保留关键日志 excerpt
3. 不要求 100% 结构化
```

---

## 24.3 Worktree 操作破坏用户仓库

解决：

```text
1. 默认 ask
2. worktree 目录固定在 .agent/worktrees
3. 不自动 merge
4. 清理前确认
```

---

## 24.4 Review 误判

Review Engine 不应作为唯一真理。

策略：

```text
1. Review error 才阻止完成
2. warning 只提示用户
3. 测试结果优先级高于模型 review
```

---

## 24.5 Error Recovery 无限循环

必须限制：

```text
max_test_fix_iterations
max_patch_retries
max_total_steps
```

---

# 25. 阶段四最终总结

阶段四的核心价值是：

> 让 Agent 从“会调用工具”升级为“会按工程流程完成代码任务”。

完成阶段四后，系统应该具备：

```text
1. 复杂任务先计划
2. 用户确认后执行
3. 修改可隔离
4. 测试可自动运行
5. 失败可分析并修复
6. diff 可审查
7. 最终结果可验证
8. 状态可恢复
```

一句话总结：

> 第四阶段的目标，是把 Agent Runtime 从“安全可控的执行器”升级为“具备真实软件工程闭环的代码 Agent”。  
