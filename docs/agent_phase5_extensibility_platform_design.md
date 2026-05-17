# 第五阶段：扩展能力平台化设计文档

> 阶段：Phase 5  
> 主题：Extensibility Platformization  
> 技术栈：TypeScript / Node.js  
> 前置条件：阶段一最小闭环、阶段二多模型、阶段三安全上下文、阶段四工程能力增强已完成  
> 阶段目标：让 Agent 从“单机代码工程助手”升级为“可扩展、可插件化、可接外部系统的 Agent 平台”。

---

## 1. 阶段五目标

前四个阶段已经完成：

```text
阶段一：最小 Agent Loop
阶段二：多模型 Provider
阶段三：权限、安全、上下文、审计
阶段四：Plan Mode、Git、Test Runner、LSP、Review、Worktree、Error Recovery
```

第五阶段要解决：

> 如何把 Agent 能力平台化，让它可以通过 MCP 接外部系统，通过 Hooks 接入确定性流程，通过 Skills 复用专业工作流，通过 Subagents 拆分复杂任务，通过 Plugin 打包能力，并逐步支持 Web UI / IDE / CI 等多入口。

阶段五需要完成：

```text
1. MCP Adapter
2. Hook System
3. Skill Engine
4. Subagent Manager
5. Plugin System 初版
6. Command System
7. Web UI 初版
8. VS Code 插件初版
9. CI Bot 初版
10. Extension Registry
11. Capability Manifest
12. 插件权限模型
13. 扩展审计
14. 平台化配置
```

---

## 2. 阶段五不做什么

阶段五开始平台化，但仍然不要一步到位做企业 SaaS。

暂时不要做：

```text
1. 完整插件市场
2. 远程多租户商业化平台
3. 完整企业 RBAC 后台
4. 计费系统
5. 大规模任务调度集群
6. 多人实时协同编辑
7. 云端沙箱集群
8. 完整 Marketplace 审核系统
```

阶段五目标是：

> 打通扩展机制，让内部团队或开发者可以给 Agent 添加工具、工作流、子代理和入口。

---

## 3. 阶段五完成后的效果

完成后，用户可以：

```bash
agent mcp add github
agent hooks list
agent skills list
agent skill run code-review
agent agents list
agent plugin install ./plugins/frontend-agent
agent review --diff
```

也可以通过项目配置启用扩展：

```yaml
plugins:
  - frontend-agent
  - github-tools
  - code-review

mcp:
  servers:
    github:
      command: "npx"
      args: ["-y", "@modelcontextprotocol/server-github"]

hooks:
  PreToolUse:
    - name: block-prod-db
      run: ".agent/hooks/block-prod-db.ts"

skills:
  enabled:
    - code-review
    - frontend-ui
```

Agent 应该具备：

```text
1. 可以通过 MCP 调 GitHub / DB / Browser / 内部 API
2. 可以在工具执行前后运行 Hook
3. 可以加载项目级 Skill
4. 可以启动子代理完成隔离任务
5. 可以安装 Plugin 打包 MCP + Skill + Agent + Hook
6. 可以在 Web UI 查看任务、日志和 diff
7. 可以在 VS Code 中触发 Agent
8. 可以在 CI 中运行审查或修复任务
```

---

# 4. 阶段五总体架构

```text
┌──────────────────────────────────────────────────────────────┐
│                       User Entrypoints                       │
│ CLI / Web UI / VS Code Extension / CI Bot / API Server        │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                    Agent Runtime Core                        │
│ Agent Loop / Context / Permission / Tools / Model / Audit     │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                    Extension Platform                        │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ MCP Adapter      │  │ Hook System      │                 │
│  └──────────────────┘  └──────────────────┘                 │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ Skill Engine     │  │ Subagent Manager │                 │
│  └──────────────────┘  └──────────────────┘                 │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ Plugin Manager   │  │ Command System   │                 │
│  └──────────────────┘  └──────────────────┘                 │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                      External Systems                        │
│ GitHub / GitLab / Jira / Slack / Browser / DB / Internal API  │
└──────────────────────────────────────────────────────────────┘
```

---

# 5. MCP Adapter 设计

## 5.1 MCP 的定位

MCP 是外部系统工具接入层。

它解决的问题是：

```text
Agent Runtime 不需要为每个外部系统写死工具。
外部系统通过 MCP Server 暴露能力。
Agent 通过统一协议调用这些能力。
```

典型 MCP Server：

```text
GitHub MCP
GitLab MCP
Browser MCP
PostgreSQL MCP
Filesystem MCP
Jira MCP
Slack MCP
内部业务系统 MCP
```

---

## 5.2 MCP 架构

```text
Agent Tool Registry
        ↓
MCP Adapter
        ↓
MCP Client
        ↓
MCP Server Process / Remote MCP Server
        ↓
External System
```

---

## 5.3 MCP Server 配置

`.agent/settings.yaml`

```yaml
mcp:
  servers:
    github:
      transport: stdio
      command: "npx"
      args:
        - "-y"
        - "@modelcontextprotocol/server-github"
      env:
        GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}"

    browser:
      transport: stdio
      command: "npx"
      args:
        - "-y"
        - "@modelcontextprotocol/server-playwright"

    internal-api:
      transport: http
      url: "https://internal.example.com/mcp"
      headers:
        Authorization: "Bearer ${INTERNAL_API_TOKEN}"
```

---

## 5.4 MCP Tool 命名规范

MCP 工具注册到内部 Tool Registry 时，需要统一命名：

```text
mcp__<serverName>__<toolName>
```

示例：

```text
mcp__github__search_repositories
mcp__github__create_issue
mcp__browser__navigate
mcp__postgres__query
mcp__jira__create_ticket
```

---

## 5.5 MCP 权限配置

```yaml
permissions:
  mcp:
    allow:
      - "mcp__github__search_*"
      - "mcp__github__get_*"
      - "mcp__browser__screenshot"

    ask:
      - "mcp__github__create_issue"
      - "mcp__jira__create_ticket"
      - "mcp__browser__click"
      - "mcp__postgres__query"

    deny:
      - "mcp__github__delete_*"
      - "mcp__postgres__drop_*"
      - "mcp__postgres__update_*"
      - "mcp__postgres__delete_*"
```

原则：

```text
读操作默认 allow 或 ask。
写操作默认 ask。
删除、破坏性操作默认 deny。
数据库写操作默认 deny。
```

---

## 5.6 MCP Tool Schema 转换

MCP Server 返回的 tool schema 需要转换为内部 ToolSchema：

```ts
export interface McpToolDescriptor {
  serverName: string;
  toolName: string;
  description: string;
  inputSchema: JSONSchema;
}

export function toInternalToolSchema(mcpTool: McpToolDescriptor): ToolSchema {
  return {
    name: `mcp__${mcpTool.serverName}__${mcpTool.toolName}`,
    description: mcpTool.description,
    parameters: mcpTool.inputSchema,
    metadata: {
      source: "mcp",
      serverName: mcpTool.serverName,
      originalToolName: mcpTool.toolName,
    },
  };
}
```

---

## 5.7 MCP 执行流程

```text
模型调用 mcp__github__create_issue
      ↓
ToolCall Normalizer
      ↓
Permission Engine 检查 MCP 权限
      ↓
PreToolUse Hook
      ↓
MCP Adapter 还原 server/tool
      ↓
MCP Client 调用 MCP Server
      ↓
MCP Server 返回结果
      ↓
PostToolUse Hook
      ↓
Tool Result 回填模型
```

---

## 5.8 MCP 错误处理

常见错误：

```text
1. MCP Server 未启动
2. MCP Server 启动失败
3. 工具不存在
4. 参数不合法
5. 外部系统认证失败
6. 外部系统超时
7. MCP Server 返回非结构化错误
```

处理策略：

```text
1. 启动失败时提示用户检查配置
2. 工具不存在时刷新 MCP tool list
3. 认证失败时不要泄露 token
4. 超时时记录并允许重试
5. MCP 错误作为 observation 回填模型
```

---

# 6. Hook System 设计

## 6.1 Hook 的定位

Hook 是 Agent 生命周期中的确定性扩展点。

它解决的问题是：

```text
模型是概率系统，Hook 是确定性规则。
企业规则、项目规则、安全规则、格式化、测试、审计都应该通过 Hook 执行。
```

---

## 6.2 Hook 生命周期

```text
SessionStart
UserPromptSubmit
BeforeModelCall
AfterModelCall
PreToolUse
PostToolUse
ToolError
BeforePatchApply
AfterPatchApply
BeforeShellRun
AfterShellRun
BeforeContextCompact
AfterContextCompact
BeforeReview
AfterReview
SessionEnd
```

---

## 6.3 Hook 类型

支持三种 Hook：

```text
1. command hook
2. script hook
3. http hook
```

### command hook

```yaml
hooks:
  AfterPatchApply:
    - name: run-format
      type: command
      command: "npm run format"
```

### script hook

```yaml
hooks:
  PreToolUse:
    - name: block-prod-db
      type: script
      path: ".agent/hooks/block-prod-db.ts"
```

### http hook

```yaml
hooks:
  SessionEnd:
    - name: notify-server
      type: http
      url: "https://internal.example.com/agent/hooks/session-end"
```

---

## 6.4 Hook 输入

```ts
export interface HookInput {
  event: HookEvent;
  sessionId: string;
  projectPath: string;
  runMode: RunMode;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  modelRequest?: ModelRequest;
  modelResponse?: ModelResponse;
  patch?: string;
  diff?: string;
  metadata?: Record<string, unknown>;
}
```

---

## 6.5 Hook 输出

```ts
export type HookResult =
  | { action: "continue" }
  | { action: "deny"; reason: string }
  | { action: "ask"; reason: string }
  | { action: "modify_input"; input: unknown }
  | { action: "add_context"; context: string }
  | { action: "replace_result"; result: unknown };
```

---

## 6.6 Hook 执行规则

```text
1. Hook 按配置顺序执行
2. deny 立即终止后续执行
3. ask 触发用户确认
4. modify_input 只允许在 PreToolUse / BeforeModelCall 阶段
5. replace_result 只允许在 PostToolUse / AfterModelCall 阶段
6. Hook 超时默认失败
7. Hook 失败是否阻断由配置决定
```

---

## 6.7 Hook 配置示例

### 禁止生产数据库访问

```yaml
hooks:
  PreToolUse:
    - name: block-prod-db
      type: script
      path: ".agent/hooks/block-prod-db.ts"
      matcher:
        tool: "mcp__postgres__query"
```

脚本逻辑：

```ts
export default async function hook(input: HookInput): Promise<HookResult> {
  const sql = String(input.toolCall?.arguments?.query ?? "");

  if (/prod|production/i.test(sql)) {
    return {
      action: "deny",
      reason: "禁止访问生产数据库",
    };
  }

  return { action: "continue" };
}
```

---

### Patch 后自动格式化

```yaml
hooks:
  AfterPatchApply:
    - name: format-after-patch
      type: command
      command: "npm run format"
      on_failure: "ask"
```

---

### Shell 执行前拦截

```yaml
hooks:
  BeforeShellRun:
    - name: block-dangerous-shell
      type: script
      path: ".agent/hooks/block-dangerous-shell.ts"
```

---

# 7. Skill Engine 设计

## 7.1 Skill 的定位

Skill 是可复用的任务流程包。

它不是底层工具，而是：

```text
一组领域任务说明
+ 固定流程
+ 输出格式
+ 检查清单
+ 示例
+ 可选脚本
```

例如：

```text
code-review
frontend-ui
security-audit
rbac-design
pointcloud-visualization
test-generation
api-design
```

---

## 7.2 Skill 目录结构

项目级：

```text
.agent/skills/
├── code-review/
│   ├── SKILL.md
│   ├── examples/
│   └── scripts/
├── frontend-ui/
│   └── SKILL.md
└── security-audit/
    └── SKILL.md
```

用户级：

```text
~/.agent/skills/
├── code-review/
└── doc-writer/
```

插件级：

```text
plugins/frontend-agent/skills/frontend-ui/SKILL.md
```

---

## 7.3 SKILL.md 格式

```md
# Skill: Code Review

## Description

用于审查代码 diff，发现 bug、安全风险、可维护性问题和测试覆盖问题。

## When to use

当用户要求：
- 审查代码
- review diff
- 检查 PR
- 找潜在 bug

## Required tools

- git_diff
- read_file
- grep

## Process

1. 获取当前 diff。
2. 识别变更文件。
3. 阅读相关上下文。
4. 检查正确性。
5. 检查安全风险。
6. 检查测试覆盖。
7. 输出分级问题。

## Output format

```json
{
  "summary": "string",
  "issues": [
    {
      "severity": "error | warning | info",
      "file": "string",
      "line": 0,
      "message": "string"
    }
  ],
  "recommendations": []
}
```

## Constraints

- 不修改代码。
- 不执行写操作。
- 不输出无依据问题。
```

---

## 7.4 Skill Manifest

可选 `skill.yaml`：

```yaml
name: code-review
description: 审查代码 diff
version: 0.1.0
tools:
  - git_diff
  - read_file
  - grep
allowed_modes:
  - read_only
  - suggest
models:
  preferred:
    - claude-sonnet
    - gpt-5.5
```

---

## 7.5 Skill 加载流程

```text
启动 Session
      ↓
Skill Engine 扫描技能目录
      ↓
根据用户任务匹配 Skill
      ↓
把 Skill 摘要加入上下文
      ↓
如明确调用 Skill，则加载完整 SKILL.md
      ↓
Agent 按 Skill 流程执行
```

---

## 7.6 Skill 匹配策略

```text
1. 用户显式调用：agent skill run code-review
2. CLI 参数指定：agent --skill code-review
3. 任务关键词匹配
4. Agent 自行请求加载 Skill
```

阶段五建议先实现：

```text
显式调用 + CLI 参数指定
```

后续再做自动匹配。

---

## 7.7 Skill 命令

```bash
agent skills list
agent skills show code-review
agent skill run code-review
agent --skill code-review "审查当前 diff"
```

---

# 8. Subagent Manager 设计

## 8.1 Subagent 的定位

Subagent 是有独立上下文、独立工具权限、独立模型配置的小代理。

它解决：

```text
1. 主上下文污染
2. 复杂任务拆分
3. 专业角色隔离
4. 工具权限隔离
5. 多步骤调查
```

---

## 8.2 Subagent 类型

阶段五建议内置：

```text
research-agent
code-reviewer
test-fixer
security-auditor
doc-writer
frontend-agent
backend-agent
```

---

## 8.3 Subagent 配置

`.agent/agents/code-reviewer.yaml`

```yaml
name: code-reviewer
description: 审查代码 diff，发现 bug、安全风险和可维护性问题
model: claude-sonnet
tools:
  - git_diff
  - read_file
  - grep
  - lsp_diagnostics
permissions:
  write: false
  shell: false
  mcp:
    allow:
      - "mcp__github__get_*"
```

---

## 8.4 Subagent 执行流程

```text
Main Agent 决定调用 code-reviewer
      ↓
Subagent Manager 创建子 Session
      ↓
加载子 Agent system prompt
      ↓
分配工具和权限
      ↓
执行子 Agent Loop
      ↓
返回压缩后的结果给 Main Agent
```

---

## 8.5 Subagent 输入

```ts
export interface SubagentRunInput {
  parentSessionId: string;
  agentName: string;
  task: string;
  context?: string;
  allowedFiles?: string[];
  maxSteps?: number;
}
```

---

## 8.6 Subagent 输出

```ts
export interface SubagentRunResult {
  success: boolean;
  summary: string;
  findings: SubagentFinding[];
  artifacts?: Artifact[];
  childSessionId: string;
}
```

---

## 8.7 子代理上下文隔离

原则：

```text
1. 子代理不继承全部主上下文
2. 只传任务相关摘要
3. 子代理工具结果不直接污染主上下文
4. 只把最终 summary 返回主 Agent
5. 子代理权限可以比主 Agent 更小
```

---

## 8.8 Subagent 工具

新增一个内部工具：

```text
run_subagent
```

参数：

```ts
interface RunSubagentArgs {
  agentName: string;
  task: string;
  context?: string;
  maxSteps?: number;
}
```

权限：

```yaml
permissions:
  subagents:
    allow:
      - "code-reviewer"
      - "research-agent"
    ask:
      - "test-fixer"
      - "security-auditor"
```

---

# 9. Plugin System 设计

## 9.1 Plugin 的定位

Plugin 是能力打包单位。

一个 Plugin 可以包含：

```text
1. Skills
2. Subagents
3. Hooks
4. MCP Servers
5. Commands
6. Settings
7. Tool definitions
8. Prompt templates
```

---

## 9.2 Plugin 目录结构

```text
plugins/
└── frontend-agent/
    ├── plugin.yaml
    ├── README.md
    ├── skills/
    │   └── frontend-ui/
    │       └── SKILL.md
    ├── agents/
    │   └── frontend-reviewer.yaml
    ├── hooks/
    │   └── run-eslint.ts
    ├── commands/
    │   └── ui-review.md
    └── mcp/
        └── playwright.yaml
```

---

## 9.3 plugin.yaml

```yaml
name: frontend-agent
version: 0.1.0
description: 前端 UI 和交互审查 Agent 插件
author: internal-team

skills:
  - path: skills/frontend-ui

agents:
  - path: agents/frontend-reviewer.yaml

hooks:
  - event: AfterPatchApply
    path: hooks/run-eslint.ts

commands:
  - name: ui-review
    path: commands/ui-review.md

mcp:
  servers:
    playwright:
      config: mcp/playwright.yaml

permissions:
  tools:
    ask:
      - "mcp__playwright__click"
    allow:
      - "mcp__playwright__screenshot"
```

---

## 9.4 Plugin 安装

```bash
agent plugin install ./plugins/frontend-agent
agent plugin list
agent plugin enable frontend-agent
agent plugin disable frontend-agent
agent plugin remove frontend-agent
```

---

## 9.5 Plugin 加载流程

```text
启动 Agent
      ↓
读取全局 plugins
      ↓
读取项目 plugins
      ↓
解析 plugin.yaml
      ↓
注册 Skills
      ↓
注册 Subagents
      ↓
注册 Hooks
      ↓
注册 Commands
      ↓
注册 MCP Servers
      ↓
合并 Permission Policy
```

---

## 9.6 Plugin 权限

Plugin 不能默认获得所有权限。

安装时展示：

```text
Plugin frontend-agent 请求以下权限：

Skills:
  - frontend-ui

Subagents:
  - frontend-reviewer

Hooks:
  - AfterPatchApply 执行 hooks/run-eslint.ts

MCP:
  - playwright server
  - mcp__playwright__screenshot
  - mcp__playwright__click，需要确认

是否安装？[y/N]
```

---

# 10. Command System 设计

## 10.1 Command 的定位

Command 是用户快捷指令模板。

例如：

```bash
agent /review
agent /fix-tests
agent /explain-module src/auth
agent /generate-tests src/math.ts
```

---

## 10.2 Command 文件

`.agent/commands/review.md`

```md
# Command: review

请审查当前 git diff。

要求：
1. 获取 git diff。
2. 阅读相关文件。
3. 检查 bug、安全问题、测试覆盖和可维护性。
4. 不修改代码。
5. 按 error/warning/info 输出问题。
```

---

## 10.3 Command Manifest

```yaml
name: review
description: 审查当前 diff
mode: read_only
skill: code-review
tools:
  - git_diff
  - read_file
  - grep
```

---

## 10.4 Command 解析

用户输入：

```bash
agent /review
```

转换为：

```text
加载 .agent/commands/review.md
设置 mode=read_only
加载 skill=code-review
执行 Agent
```

---

# 11. Web UI 初版

## 11.1 Web UI 定位

Web UI 初版不做复杂 IDE。

主要用于：

```text
1. 查看 Session 列表
2. 查看任务执行过程
3. 查看工具调用日志
4. 查看 diff
5. 审批 ask 操作
6. 查看测试结果
7. 查看 review 结果
```

---

## 11.2 Web UI 页面

```text
/pages
├── Sessions
├── Session Detail
├── Diff Viewer
├── Tool Calls
├── Model Calls
├── Approvals
├── Settings
└── Plugins
```

---

## 11.3 API Server

新增 `apps/server`：

```text
apps/server/
├── src/
│   ├── index.ts
│   ├── routes/
│   │   ├── sessions.ts
│   │   ├── approvals.ts
│   │   ├── plugins.ts
│   │   └── settings.ts
│   └── services/
```

---

## 11.4 API 示例

```http
GET /api/sessions
GET /api/sessions/:id
GET /api/sessions/:id/tool-calls
GET /api/sessions/:id/diff
POST /api/approvals/:id/approve
POST /api/approvals/:id/reject
GET /api/plugins
POST /api/plugins/install
```

---

## 11.5 Web UI 技术栈

```text
Next.js / React
Tailwind CSS
Monaco Editor 或 CodeMirror
diff2html / react-diff-view
WebSocket / SSE 实时日志
```

---

# 12. VS Code 插件初版

## 12.1 插件定位

VS Code 插件用于把 Agent 接入开发者日常编辑环境。

阶段五初版只做：

```text
1. 从当前 workspace 启动 Agent
2. 选中文件 / 选中代码作为上下文
3. 显示 Agent 输出
4. 展示 diff
5. 用户批准 patch
6. 运行 review 命令
```

---

## 12.2 VS Code 命令

```text
Agent: Explain Current File
Agent: Fix Selected Code
Agent: Review Current Diff
Agent: Generate Tests
Agent: Run Task
Agent: Show Sessions
```

---

## 12.3 VS Code 架构

```text
VS Code Extension
      ↓
Local Agent CLI / Server
      ↓
Agent Runtime
      ↓
Session Store
```

第一版推荐：

```text
VS Code 插件调用本地 agent CLI 或本地 server。
不要把 Agent Runtime 直接塞进 Extension。
```

---

## 12.4 插件通信方式

两种方案：

### 方案 A：调用 CLI

```text
VS Code extension spawn:
  agent --json "修复选中代码"
```

优点：

```text
实现简单
复用 CLI
```

缺点：

```text
实时交互较弱
```

### 方案 B：本地 Server

```text
agent server start
VS Code 通过 HTTP/WebSocket 调用
```

优点：

```text
实时日志
审批交互好
```

缺点：

```text
实现复杂一点
```

阶段五建议：

```text
先实现方案 A，再演进方案 B。
```

---

# 13. CI Bot 初版

## 13.1 CI Bot 定位

CI Bot 用于在 CI 环境中执行只读或半自动任务。

典型场景：

```text
1. PR 代码审查
2. 测试失败分析
3. 生成修复建议
4. 自动提交修复 patch
5. 生成 review comment
```

---

## 13.2 CI 命令

```bash
agent ci review --base main
agent ci analyze-failure --test-log ./test.log
agent ci suggest-fix --no-apply
```

---

## 13.3 GitHub Actions 示例

```yaml
name: Agent Review

on:
  pull_request:

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Agent Review
        run: |
          npx agent ci review --base origin/main --output review.md

      - name: Upload Review
        uses: actions/upload-artifact@v4
        with:
          name: agent-review
          path: review.md
```

---

## 13.4 CI 安全模式

CI 默认：

```text
mode: read_only 或 suggest
network: deny
write: deny
secrets: deny
```

如果要自动修复：

```text
必须在 sandbox_auto
必须输出 patch
不能直接 push
```

---

# 14. Extension Registry

## 14.1 目标

统一管理扩展：

```text
MCP Servers
Hooks
Skills
Subagents
Plugins
Commands
```

---

## 14.2 Registry 接口

```ts
export interface ExtensionRegistry {
  registerSkill(skill: SkillDefinition): void;
  registerSubagent(agent: SubagentDefinition): void;
  registerHook(hook: HookDefinition): void;
  registerCommand(command: CommandDefinition): void;
  registerMcpServer(server: McpServerDefinition): void;
  registerPlugin(plugin: PluginDefinition): void;
}
```

---

## 14.3 查询能力

```ts
registry.listSkills();
registry.listSubagents();
registry.listHooks();
registry.listCommands();
registry.listMcpServers();
registry.listPlugins();
```

---

# 15. Capability Manifest

## 15.1 目标

让系统能清晰知道当前 Agent 具备哪些能力。

```json
{
  "models": ["qwen-coder", "claude-sonnet"],
  "tools": ["read_file", "grep", "apply_patch", "run_shell"],
  "mcpServers": ["github", "browser"],
  "skills": ["code-review", "frontend-ui"],
  "subagents": ["code-reviewer", "test-fixer"],
  "hooks": ["block-secrets", "run-format"],
  "commands": ["review", "fix-tests"]
}
```

---

## 15.2 用途

```text
1. 给模型提供能力摘要
2. 给 Web UI 展示当前能力
3. 给 Plugin 安装时做冲突检查
4. 给调试日志记录
5. 给权限系统判断能力边界
```

---

# 16. 配置设计

## 16.1 项目配置

`.agent/settings.yaml`

```yaml
extensions:
  plugins:
    enabled:
      - frontend-agent
      - github-tools

  skills:
    enabled:
      - code-review
      - frontend-ui

  subagents:
    enabled:
      - code-reviewer
      - test-fixer

mcp:
  servers:
    github:
      transport: stdio
      command: "npx"
      args:
        - "-y"
        - "@modelcontextprotocol/server-github"

hooks:
  AfterPatchApply:
    - name: format
      type: command
      command: "npm run format"

commands:
  paths:
    - ".agent/commands"
```

---

## 16.2 全局配置

`~/.agent/config.yaml`

```yaml
plugins:
  directories:
    - "~/.agent/plugins"

skills:
  directories:
    - "~/.agent/skills"

agents:
  directories:
    - "~/.agent/agents"

mcp:
  servers:
    filesystem:
      transport: stdio
      command: "npx"
      args:
        - "-y"
        - "@modelcontextprotocol/server-filesystem"
```

---

# 17. 目录结构增强

```text
agent-platform/
├── apps/
│   ├── cli/
│   ├── server/
│   ├── web/
│   ├── vscode-extension/
│   └── ci/
│
├── packages/
│   ├── core/
│   ├── models/
│   ├── tools/
│   ├── permissions/
│   ├── context/
│   ├── engineering/
│   ├── mcp/
│   ├── hooks/
│   ├── skills/
│   ├── subagents/
│   ├── plugins/
│   ├── commands/
│   ├── extensions/
│   └── common/
│
├── plugins/
│   ├── frontend-agent/
│   ├── github-tools/
│   └── code-review/
│
├── examples/
└── docs/
```

---

# 18. 阶段五开发任务拆分

## Task 1：实现 Extension Registry

### 需要完成

```text
1. 注册 Skill
2. 注册 Subagent
3. 注册 Hook
4. 注册 Command
5. 注册 MCP Server
6. 注册 Plugin
7. 输出 Capability Manifest
```

### 验证

`agent capabilities` 能输出当前能力。

---

## Task 2：实现 MCP Adapter

### 需要完成

```text
1. 读取 mcp servers 配置
2. 启动 stdio MCP server
3. 获取 tools list
4. 注册到 Tool Registry
5. 执行 MCP tool
6. 权限检查
7. 错误处理
```

### 验证

接入 mock MCP server，调用 `mcp__mock__echo` 成功。

---

## Task 3：实现 Hook System

### 需要完成

```text
1. Hook 生命周期
2. command hook
3. script hook
4. HookResult
5. 超时处理
6. audit 日志
```

### 验证

AfterPatchApply 自动运行格式化命令。

---

## Task 4：实现 Skill Engine

### 需要完成

```text
1. 扫描 Skill 目录
2. 解析 SKILL.md
3. skill list/show/run
4. CLI --skill
5. Skill 注入上下文
```

### 验证

`agent --skill code-review "审查当前 diff"` 能加载 Skill。

---

## Task 5：实现 Subagent Manager

### 需要完成

```text
1. 解析 subagent yaml
2. 创建子 Session
3. 独立上下文
4. 独立工具权限
5. 返回 summary
6. run_subagent 工具
```

### 验证

Main Agent 调用 code-reviewer 子代理审查 diff。

---

## Task 6：实现 Plugin Manager

### 需要完成

```text
1. 解析 plugin.yaml
2. 安装本地 plugin
3. enable/disable
4. 注册 plugin 中的 Skill / Agent / Hook / MCP / Command
5. 展示权限请求
```

### 验证

安装 `frontend-agent` 插件后，新增 skill 和 command 可用。

---

## Task 7：实现 Command System

### 需要完成

```text
1. 解析 .agent/commands/*.md
2. 支持 /command 调用
3. 支持 command metadata
4. 支持 command 绑定 skill/mode/tools
```

### 验证

`agent /review` 可以执行 code-review 流程。

---

## Task 8：实现 Web UI 初版

### 需要完成

```text
1. Session 列表
2. Session 详情
3. Tool Calls 展示
4. Diff 展示
5. Approval 操作
6. 实时日志
```

### 验证

浏览器中可以查看一次 Agent 任务全过程。

---

## Task 9：实现 VS Code 插件初版

### 需要完成

```text
1. 调用本地 CLI
2. Explain Current File
3. Review Current Diff
4. Fix Selected Code
5. 显示输出
```

### 验证

在 VS Code 中对当前文件发起 Agent 任务。

---

## Task 10：实现 CI Bot 初版

### 需要完成

```text
1. agent ci review
2. agent ci analyze-failure
3. 输出 markdown 报告
4. 只读模式运行
```

### 验证

GitHub Actions 中运行 review 任务。

---

# 19. 阶段五测试用例

## 19.1 MCP Mock Server 测试

### 场景

配置 mock MCP server：

```yaml
mcp:
  servers:
    mock:
      transport: stdio
      command: "node"
      args: ["mock-mcp-server.js"]
```

工具：

```text
echo
```

### 期望

```text
1. MCP server 启动
2. Tool Registry 出现 mcp__mock__echo
3. Agent 能调用 echo
4. 结果回填模型
```

---

## 19.2 MCP 权限测试

调用：

```text
mcp__github__delete_repo
```

期望：

```text
deny
```

调用：

```text
mcp__github__create_issue
```

期望：

```text
ask
```

---

## 19.3 Hook 测试

配置：

```yaml
hooks:
  AfterPatchApply:
    - name: touch-marker
      type: command
      command: "echo formatted > .agent/tmp/marker.txt"
```

期望：

```text
Patch 应用后 marker 文件出现。
```

---

## 19.4 Hook Deny 测试

PreToolUse Hook 返回：

```json
{
  "action": "deny",
  "reason": "blocked by hook"
}
```

期望：

```text
工具不执行。
audit 记录 hook deny。
```

---

## 19.5 Skill 加载测试

命令：

```bash
agent --skill code-review "审查当前 diff"
```

期望：

```text
1. 加载 SKILL.md
2. 使用 read_only 模式
3. 获取 git diff
4. 输出 review
```

---

## 19.6 Subagent 测试

Main Agent 调用：

```json
{
  "agentName": "code-reviewer",
  "task": "审查当前 diff"
}
```

期望：

```text
1. 创建子 Session
2. 子代理读取 diff
3. 返回 summary
4. 主 Agent 上下文只包含 summary
```

---

## 19.7 Plugin 安装测试

命令：

```bash
agent plugin install ./plugins/frontend-agent
```

期望：

```text
1. 解析 plugin.yaml
2. 展示权限请求
3. 用户确认
4. 注册 skill / agent / hook / command
5. plugin list 中可见
```

---

## 19.8 Command 测试

命令：

```bash
agent /review
```

期望：

```text
加载 .agent/commands/review.md 并执行。
```

---

## 19.9 Web UI 测试

执行一次 Agent 任务。

期望 Web UI 显示：

```text
1. Session
2. Tool calls
3. Model calls
4. Diff
5. Audit
6. Final result
```

---

## 19.10 VS Code 插件测试

在 VS Code 中选择代码，执行：

```text
Agent: Fix Selected Code
```

期望：

```text
1. 插件调用本地 agent
2. Agent 使用选区作为上下文
3. 返回 patch 或建议
```

---

# 20. 阶段五集成测试

## 20.1 MCP + Skill + Hook 集成

任务：

```text
审查当前 diff，如果发现问题创建 GitHub issue
```

期望：

```text
1. Skill code-review 加载
2. Agent 审查 diff
3. 调用 mcp__github__create_issue
4. Permission ask
5. 用户确认后创建 issue
6. Hook 记录操作
```

---

## 20.2 Subagent + Review 集成

任务：

```text
实现功能后让 code-reviewer 审查
```

期望：

```text
1. Main Agent 修改代码
2. Test Runner 验证
3. Subagent code-reviewer 审查 diff
4. Main Agent 根据 review 决定是否继续修复
```

---

## 20.3 Plugin 集成

安装 frontend-agent 插件后：

```bash
agent /ui-review
```

期望：

```text
1. command 来自 plugin
2. skill 来自 plugin
3. subagent 来自 plugin
4. hook 来自 plugin
5. 正常完成 UI review
```

---

## 20.4 Web Approval 集成

任务中 Agent 尝试执行 ask 操作。

期望：

```text
1. CLI 或 Web UI 出现 approval
2. 用户在 Web UI 点击 approve
3. Agent 继续执行
```

---

# 21. 阶段五验收标准

## 21.1 必须满足

```text
1. 支持 MCP Adapter 初版
2. 支持 stdio MCP Server
3. MCP tools 能注册到 Tool Registry
4. MCP tools 经过 Permission Engine
5. 支持 Hook 生命周期初版
6. 支持 command hook 和 script hook
7. 支持 Skill Engine 初版
8. 支持 Subagent Manager 初版
9. 支持 Plugin Manager 初版
10. 支持 Command System
11. 支持 Capability Manifest
12. 支持 Web UI 查看 session / diff / tool calls
13. 支持 VS Code 插件调用本地 CLI
14. 支持 CI review 命令
```

---

## 21.2 可以暂时不满足

```text
1. Remote MCP 完整安全认证
2. 插件市场
3. 插件签名
4. 企业级审批流
5. 多用户 Web UI
6. 完整 IDE 内联编辑
7. 自动 PR 创建
8. 分布式 Agent 执行
9. 多 Agent 并行调度
```

---

# 22. 推荐开发顺序

```text
1. Extension Registry
2. Capability Manifest
3. MCP Adapter
4. MCP Permission
5. Hook System
6. Skill Engine
7. Command System
8. Subagent Manager
9. Plugin Manager
10. Web UI 初版
11. VS Code 插件初版
12. CI Bot 初版
13. 集成测试
```

---

# 23. 阶段五风险点

## 23.1 MCP 工具权限失控

MCP Server 可能暴露危险工具。

解决：

```text
1. MCP 工具默认 ask
2. 删除/写入类工具默认 deny
3. 数据库写操作默认 deny
4. 每个 MCP Server 有独立权限命名空间
```

---

## 23.2 Hook 执行风险

Hook 本质上可以执行命令或脚本。

解决：

```text
1. Hook 安装需要用户确认
2. 项目 Hook 默认 ask
3. 企业策略可禁用 Hook
4. Hook 有 timeout
5. Hook 输入输出写审计
```

---

## 23.3 Skill Prompt 注入

Skill 是 Prompt 级扩展，可能写入不安全指令。

解决：

```text
1. Skill 不能覆盖系统安全规则
2. Skill 不能提升权限
3. Skill 只能建议工具使用
4. 权限仍由 Runtime 控制
```

---

## 23.4 Subagent 上下文膨胀

子代理可能产生大量输出。

解决：

```text
1. 子代理只返回 summary
2. 子代理有 maxSteps
3. 子代理有独立 token limit
4. 子代理日志单独保存
```

---

## 23.5 Plugin 权限过大

Plugin 可能一次安装多个危险能力。

解决：

```text
1. 安装前展示权限请求
2. 默认 disabled
3. 用户逐项启用
4. 插件不能绕过 Permission Engine
5. 插件写入 audit
```

---

## 23.6 Web UI 审批一致性

CLI 和 Web UI 同时审批可能冲突。

解决：

```text
1. Approval 有唯一 id
2. 审批状态原子更新
3. 已处理审批不能重复处理
4. Session 状态机控制并发
```

---

# 24. 阶段五最终总结

阶段五的核心价值是：

> 让 Agent 从一个单机代码工程工具，升级为可扩展、可组合、可接入外部系统的 Agent 平台。

完成阶段五后，系统将具备：

```text
1. MCP 外部系统接入
2. Hook 生命周期扩展
3. Skill 复用工作流
4. Subagent 任务隔离
5. Plugin 能力打包
6. Command 快捷任务
7. Web UI 可视化
8. VS Code 入口
9. CI Bot 入口
10. Capability Manifest 能力管理
```

一句话总结：

> 第五阶段的目标，是把前四阶段的 Agent Runtime 平台化：通过 MCP 接系统，通过 Hooks 接流程，通过 Skills 接经验，通过 Subagents 接复杂任务，通过 Plugins 接生态，通过 Web/IDE/CI 接用户入口。
