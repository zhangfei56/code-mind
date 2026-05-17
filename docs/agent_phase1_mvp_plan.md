# 阶段一：多模型 Agent 最小闭环 MVP Plan

> 目标：先完成一个可运行、可验证、可扩展的最小代码 Agent。  
> 阶段一不追求完整平台能力，只验证最核心链路：  
> **用户输入任务 → 模型判断 → 调用工具 → 执行工具 → 回填结果 → 修改文件 → 运行测试 → 输出总结**

---

## 1. 阶段一目标

阶段一只完成一个最小可用的代码 Agent。

它需要具备：

```text
1. CLI 入口
2. 单模型调用
3. Agent Loop
4. 工具调用协议
5. 文件读取
6. 目录查看
7. 代码搜索
8. Patch 应用
9. Shell 执行
10. 简单权限确认
11. Session 日志
12. 最终结果总结
```

暂时不要做：

```text
多模型
MCP
Subagents
Skills
Hooks
Web UI
VS Code 插件
复杂权限系统
复杂上下文压缩
企业权限
插件系统
```

---

## 2. 阶段一最终验收目标

完成后，应该能执行类似命令：

```bash
agent "修复 src/math.ts 里的 add 函数测试失败问题"
```

Agent 能做到：

```text
1. 读取项目文件
2. 搜索相关代码
3. 读取测试文件
4. 判断 bug 原因
5. 生成 patch
6. 询问用户是否应用
7. 应用 patch
8. 执行 npm test
9. 如果测试通过，输出总结
10. 如果测试失败，读取错误并继续修复
```

---

## 3. 阶段一模块范围

## 3.1 CLI 入口

### 需要完成

实现一个命令行入口：

```bash
agent "<task>"
```

支持基础参数：

```bash
agent "<task>" --cwd .
agent "<task>" --model local
agent "<task>" --mode suggest
agent "<task>" --max-steps 10
```

第一版只需要这些参数：

```text
--cwd         项目目录，默认当前目录
--model       模型名称，默认读取配置
--mode        执行模式，默认 suggest
--max-steps   最大 Agent Loop 步数，默认 10
```

### 示例命令

```bash
agent "解释这个项目"
agent "修复测试失败"
agent "把 add 函数改正确"
```

---

## 3.2 配置加载

### 需要完成

支持全局配置文件：

```text
~/.agent/config.yaml
```

最小配置：

```yaml
default_model: local-openai-compatible

models:
  local-openai-compatible:
    provider: openai-compatible
    base_url: "http://localhost:8000/v1"
    api_key: "EMPTY"
    model: "your-code-model"
```

也可以支持环境变量：

```bash
AGENT_MODEL_BASE_URL=http://localhost:8000/v1
AGENT_MODEL_API_KEY=EMPTY
AGENT_MODEL_NAME=your-code-model
```

阶段一只需要支持：

```text
OpenAI-compatible Provider
```

因为后续目标是接自己的模型。

---

## 3.3 ModelProvider 单模型实现

### 需要完成

定义统一接口：

```ts
export interface ModelProvider {
  chat(request: ModelRequest): Promise<ModelResponse>;
}
```

最小请求：

```ts
export interface ModelRequest {
  messages: InternalMessage[];
  tools: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
}
```

最小响应：

```ts
export interface ModelResponse {
  text: string;
  toolCalls: ToolCall[];
  usage?: TokenUsage;
  raw: unknown;
}
```

阶段一只实现：

```text
OpenAICompatibleProvider
```

也就是调用：

```text
POST /v1/chat/completions
```

如果自己的模型更适合简单 JSON Action，也可以先支持两种模式：

```text
1. OpenAI tool_calls 模式
2. JSON action 文本解析模式
```

---

## 3.4 Agent Loop

### 需要完成

实现最核心循环：

```text
构造上下文
↓
调用模型
↓
解析 tool_calls
↓
检查权限
↓
执行工具
↓
把工具结果加入上下文
↓
继续下一轮
↓
没有工具调用时输出 final answer
```

伪代码：

```ts
for (let step = 0; step < maxSteps; step++) {
  const context = contextManager.build(session);

  const response = await model.chat({
    messages: context.messages,
    tools: toolRegistry.getSchemas(),
  });

  session.addAssistantMessage(response);

  if (response.toolCalls.length === 0) {
    return final(response.text);
  }

  for (const toolCall of response.toolCalls) {
    const decision = await permissionEngine.check(toolCall);

    if (decision.type === "deny") {
      session.addToolResult(toolCall.id, {
        success: false,
        error: decision.reason,
      });
      continue;
    }

    if (decision.type === "ask") {
      const approved = await askUser(toolCall);
      if (!approved) {
        session.addToolResult(toolCall.id, {
          success: false,
          error: "User rejected this tool call.",
        });
        continue;
      }
    }

    const result = await toolRuntime.execute(toolCall);
    session.addToolResult(toolCall.id, result);
  }
}
```

---

# 4. 阶段一必须实现的工具

阶段一工具不要多，只做 5 个。

---

## 4.1 `list_dir`

### 用途

查看目录结构。

### 参数

```ts
interface ListDirArgs {
  path: string;
  depth?: number;
}
```

### 示例

```json
{
  "path": ".",
  "depth": 2
}
```

### 返回

```text
src/
  math.ts
tests/
  math.test.ts
package.json
```

### 权限

默认允许，但必须限制在项目目录内。

---

## 4.2 `read_file`

### 用途

读取文件内容。

### 参数

```ts
interface ReadFileArgs {
  path: string;
  startLine?: number;
  endLine?: number;
}
```

### 示例

```json
{
  "path": "src/math.ts"
}
```

### 返回

```text
1 export function add(a: number, b: number) {
2   return a - b;
3 }
```

### 权限

阶段一必须禁止读取：

```text
.env
.env.*
secrets/**
*.pem
*.key
```

---

## 4.3 `grep`

### 用途

搜索文件内容。

### 参数

```ts
interface GrepArgs {
  pattern: string;
  path?: string;
  include?: string;
}
```

### 示例

```json
{
  "pattern": "function add",
  "path": ".",
  "include": "*.ts"
}
```

### 返回

```text
src/math.ts:1:export function add(a: number, b: number) {
tests/math.test.ts:3:expect(add(1, 2)).toBe(3)
```

### 实现建议

第一版可以直接调用系统命令：

```bash
rg "<pattern>" <path>
```

如果没有 `rg`，fallback 到 Node.js 文件遍历。

---

## 4.4 `apply_patch`

### 用途

应用模型生成的代码修改。

### 参数

```ts
interface ApplyPatchArgs {
  patch: string;
}
```

### 示例

```diff
*** Begin Patch
*** Update File: src/math.ts
@@
 export function add(a: number, b: number) {
-  return a - b;
+  return a + b;
 }
*** End Patch
```

### 权限

阶段一建议：

```text
默认 ask
```

也就是修改文件前必须展示 patch 并询问：

```text
Apply this patch? [y/N]
```

### 重要要求

必须保存 diff 到 session 日志。

---

## 4.5 `run_shell`

### 用途

运行命令，比如测试、构建、lint。

### 参数

```ts
interface RunShellArgs {
  command: string;
  timeoutMs?: number;
}
```

### 示例

```json
{
  "command": "npm test",
  "timeoutMs": 120000
}
```

### 权限

阶段一最小权限规则：

默认允许：

```text
npm test
npm run test
npm run lint
npm run build
pnpm test
pnpm run lint
pytest
cargo test
```

默认询问：

```text
npm install *
pnpm install *
git commit *
```

默认禁止：

```text
rm -rf *
sudo *
git push *
curl * | sh
wget * | bash
chmod 777 *
```

---

# 5. 阶段一目录结构

建议先这样建：

```text
agent-platform/
├── apps/
│   └── cli/
│       ├── src/
│       │   ├── index.ts
│       │   ├── commands/
│       │   └── ui/
│       └── package.json
│
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── agent-loop/
│   │   │   ├── session/
│   │   │   ├── messages/
│   │   │   └── result/
│   │   └── package.json
│   │
│   ├── models/
│   │   ├── src/
│   │   │   ├── provider.ts
│   │   │   └── openai-compatible.ts
│   │   └── package.json
│   │
│   ├── tools/
│   │   ├── src/
│   │   │   ├── registry.ts
│   │   │   ├── list-dir.ts
│   │   │   ├── read-file.ts
│   │   │   ├── grep.ts
│   │   │   ├── apply-patch.ts
│   │   │   └── run-shell.ts
│   │   └── package.json
│   │
│   ├── permissions/
│   │   ├── src/
│   │   │   └── permission-engine.ts
│   │   └── package.json
│   │
│   ├── context/
│   │   ├── src/
│   │   │   └── context-manager.ts
│   │   └── package.json
│   │
│   └── common/
│       ├── src/
│       │   ├── types.ts
│       │   └── errors.ts
│       └── package.json
│
├── examples/
│   └── ts-bug-demo/
│       ├── src/
│       │   └── math.ts
│       ├── tests/
│       │   └── math.test.ts
│       └── package.json
│
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.json
```

阶段一不要过度拆包也可以。为了快，也可以先单包：

```text
apps/cli/src/
├── index.ts
├── agent-loop.ts
├── model-provider.ts
├── tools/
├── permissions.ts
├── context.ts
└── session.ts
```

但如果目标是长期项目，建议一开始用 monorepo。

---

# 6. 阶段一开发任务拆分

## Task 1：初始化工程

### 需要完成

```text
1. 创建 pnpm workspace
2. 创建 apps/cli
3. 配置 TypeScript
4. 配置 tsup 或 tsx
5. 配置 vitest
6. 配置 eslint/biome
```

### 验证

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter cli dev -- "hello"
```

---

## Task 2：实现 CLI

### 需要完成

CLI 能读取用户输入：

```bash
agent "解释这个项目"
```

能解析参数：

```bash
--cwd
--model
--mode
--max-steps
```

### 验证

```bash
agent "hello" --cwd . --max-steps 3
```

输出：

```text
Task: hello
CWD: ...
Mode: suggest
Max steps: 3
```

---

## Task 3：实现配置加载

### 需要完成

读取：

```text
~/.agent/config.yaml
```

如果不存在，使用环境变量或默认值。

### 验证

准备配置：

```yaml
default_model: local

models:
  local:
    provider: openai-compatible
    base_url: "http://localhost:8000/v1"
    api_key: "EMPTY"
    model: "your-code-model"
```

运行：

```bash
agent config show
```

能正确输出配置。

---

## Task 4：实现 OpenAI-compatible Provider

### 需要完成

能调用兼容接口：

```text
/v1/chat/completions
```

支持：

```text
messages
tools
temperature
max_tokens
```

能解析：

```text
assistant content
tool_calls
usage
```

### 验证

使用 mock server 或真实模型，发送：

```text
用户：你好
```

期望返回模型文本。

再发送带工具定义的请求，要求模型调用 `list_dir`。

---

## Task 5：定义内部消息和工具协议

### 需要完成

定义：

```ts
InternalMessage
ToolCall
ToolSchema
ToolResult
AgentSession
```

### 验证

单元测试：

```text
OpenAI response → normalize → Internal ToolCall
```

输入 OpenAI 风格 tool_calls，输出内部格式：

```ts
{
  id: "call_1",
  name: "read_file",
  arguments: { path: "package.json" }
}
```

---

## Task 6：实现 Tool Registry

### 需要完成

支持注册工具：

```ts
toolRegistry.register(readFileTool);
toolRegistry.register(listDirTool);
```

支持：

```ts
toolRegistry.getSchemas();
toolRegistry.execute(toolCall);
```

### 验证

单元测试：

```text
注册 read_file
通过 name 找到工具
执行工具返回结果
```

---

## Task 7：实现 `list_dir`

### 验证用例

目录：

```text
examples/ts-bug-demo/
├── src/math.ts
├── tests/math.test.ts
└── package.json
```

调用：

```json
{
  "path": ".",
  "depth": 2
}
```

期望包含：

```text
src/
tests/
package.json
```

安全测试：

```json
{
  "path": "../../"
}
```

期望失败：

```text
Path escapes workspace
```

---

## Task 8：实现 `read_file`

### 验证用例

正常读取：

```json
{
  "path": "src/math.ts"
}
```

期望返回带行号内容。

部分读取：

```json
{
  "path": "src/math.ts",
  "startLine": 1,
  "endLine": 5
}
```

敏感文件测试：

```json
{
  "path": ".env"
}
```

期望失败：

```text
Access denied
```

越界路径测试：

```json
{
  "path": "../outside.txt"
}
```

期望失败。

---

## Task 9：实现 `grep`

### 验证用例

搜索：

```json
{
  "pattern": "add",
  "path": ".",
  "include": "*.ts"
}
```

期望返回：

```text
src/math.ts
tests/math.test.ts
```

无结果：

```json
{
  "pattern": "not_exist_symbol"
}
```

期望返回空结果，但 success 为 true。

危险 pattern 不需要阶段一复杂处理，但要限制输出长度。

---

## Task 10：实现 `apply_patch`

### 需要完成

支持 unified patch 或自定义 patch 格式。

阶段一建议使用简单方案：

```text
模型输出 SEARCH/REPLACE 格式
Runtime 转换并应用
```

或者直接支持：

```diff
*** Begin Patch
*** Update File: src/math.ts
@@
-  return a - b;
+  return a + b;
*** End Patch
```

### 验证用例

原文件：

```ts
export function add(a: number, b: number) {
  return a - b;
}
```

patch：

```diff
*** Begin Patch
*** Update File: src/math.ts
@@
-  return a - b;
+  return a + b;
*** End Patch
```

期望文件变为：

```ts
export function add(a: number, b: number) {
  return a + b;
}
```

失败用例：

```text
patch 匹配不到原内容
```

期望：

```text
success: false
error: patch failed
```

---

## Task 11：实现 `run_shell`

### 需要完成

使用 `execa` 执行命令。

支持：

```text
cwd
timeoutMs
stdout/stderr 捕获
输出截断
退出码
```

### 验证用例

允许命令：

```json
{
  "command": "npm test"
}
```

期望执行。

禁止命令：

```json
{
  "command": "rm -rf ."
}
```

期望拒绝。

超时命令：

```json
{
  "command": "node -e "setTimeout(() => {}, 999999)"",
  "timeoutMs": 1000
}
```

期望超时失败。

---

## Task 12：实现 Permission Engine 简版

### 需要完成

权限决策：

```ts
type PermissionDecision =
  | { type: "allow" }
  | { type: "ask"; reason: string }
  | { type: "deny"; reason: string };
```

阶段一规则：

```text
read_file:
  .env / secrets / *.pem / *.key → deny
  其他项目内路径 → allow

list_dir:
  项目内路径 → allow

grep:
  项目内路径 → allow

apply_patch:
  suggest 模式 → ask
  auto_edit 模式 → allow

run_shell:
  安全命令 → allow
  高危命令 → deny
  其他命令 → ask
```

### 验证

单元测试覆盖：

```text
read_file .env → deny
read_file src/a.ts → allow
apply_patch suggest → ask
run_shell npm test → allow
run_shell rm -rf . → deny
run_shell npm install lodash → ask
```

---

## Task 13：实现 Session 日志

### 需要完成

每次运行创建：

```text
.agent/sessions/<session-id>/
├── messages.jsonl
├── tool-calls.jsonl
├── tool-results.jsonl
├── patches/
└── summary.md
```

记录：

```text
用户输入
模型响应
工具调用
工具结果
patch 内容
最终总结
```

### 验证

运行一次任务后，检查 session 目录存在，且 JSONL 可读。

---

## Task 14：实现 Context Manager 简版

### 需要完成

构造模型上下文：

```text
System Prompt
+ 工具使用规则
+ 用户任务
+ 最近消息
+ 工具结果
```

如果项目有 `AGENTS.md`，读取并加入上下文。

### 最小 System Prompt

```text
你是一个代码 Agent。
你可以通过工具读取文件、搜索代码、应用 patch、运行测试。
不要猜测文件内容，必须先读取文件。
修改代码前应先解释原因。
敏感文件不能读取。
完成修改后应运行相关测试。
```

### 验证

在 demo 项目中创建：

```text
AGENTS.md
```

内容：

```text
修改后必须运行 npm test。
```

运行任务时，确认模型上下文包含这段规则。

---

# 7. 阶段一测试用例

## 7.1 测试项目 1：简单 TypeScript Bug 修复

### 文件

`src/math.ts`

```ts
export function add(a: number, b: number): number {
  return a - b;
}
```

`tests/math.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { add } from "../src/math";

describe("add", () => {
  it("adds two numbers", () => {
    expect(add(1, 2)).toBe(3);
  });
});
```

### 用户任务

```text
修复测试失败
```

### 期望行为

```text
1. Agent 运行或读取测试
2. 找到 add 返回 a - b
3. 修改为 a + b
4. 运行 npm test
5. 测试通过
```

### 验收标准

```text
文件被正确修改
npm test 通过
最终总结包含修改文件和测试结果
```

---

## 7.2 测试项目 2：只读分析

### 用户任务

```text
解释这个项目结构
```

### 期望行为

```text
1. list_dir
2. read_file package.json
3. read_file README 或 src 入口
4. 输出项目结构说明
5. 不修改任何文件
```

### 验收标准

```text
没有 apply_patch 调用
没有 run_shell 写操作
输出项目目录说明
```

---

## 7.3 测试项目 3：敏感文件保护

### 文件

`.env`

```text
SECRET_KEY=abc123
```

### 用户任务

```text
读取 .env 并告诉我里面有什么
```

### 期望行为

```text
read_file .env 被 Permission Engine 拒绝
Agent 告诉用户不能读取敏感文件
```

### 验收标准

```text
.env 内容没有出现在日志或输出中
tool result 显示 Access denied
```

---

## 7.4 测试项目 4：危险命令阻止

### 用户任务

```text
执行 rm -rf . 清理项目
```

### 期望行为

```text
run_shell 被拒绝
```

### 验收标准

```text
命令未执行
输出说明该命令被安全策略阻止
```

---

## 7.5 测试项目 5：Patch 失败处理

### 用户任务

```text
把不存在的函数 multiply 改成正确实现
```

### 期望行为

```text
1. Agent 搜索 multiply
2. 没找到
3. 不应该盲目 patch
4. 应询问用户或说明未找到
```

### 验收标准

```text
没有错误修改无关文件
输出说明没有找到目标函数
```

---

## 7.6 测试项目 6：Shell 测试失败后继续修复

### 初始 bug

`src/math.ts`

```ts
export function add(a: number, b: number): number {
  return a + b + 1;
}
```

### 用户任务

```text
修复测试失败
```

### 期望行为

```text
1. 运行 npm test
2. 看到 expected 3 received 4
3. 读取 src/math.ts
4. 修改 add
5. 再运行 npm test
6. 通过
```

### 验收标准

```text
Agent 能利用测试日志继续推理
```

---

## 7.7 测试项目 7：用户拒绝 patch

### 用户任务

```text
把 add 函数改成返回 0
```

### 期望行为

```text
1. Agent 生成 patch
2. Runtime 询问是否应用
3. 用户输入 n
4. 文件不变
```

### 验收标准

```text
patch 未应用
session 记录 user rejected
```

---

# 8. 阶段一集成测试清单

建议做这些集成测试：

```text
1. CLI 能启动
2. 配置能加载
3. 模型能返回文本
4. 模型能调用 list_dir
5. 模型能调用 read_file
6. 模型能调用 grep
7. 模型能调用 apply_patch
8. 模型能调用 run_shell
9. apply_patch 前会询问
10. npm test 可以执行
11. .env 读取被阻止
12. rm -rf 被阻止
13. session 日志完整
14. max_steps 生效
15. 工具输出过长会截断
```

---

# 9. 阶段一完成标准

阶段一完成不要求 Agent 很聪明，但要求系统闭环稳定。

## 9.1 必须满足

```text
1. CLI 可运行
2. 能连接一个 OpenAI-compatible 模型
3. 能完成至少一个简单 bug 修复
4. 能读取文件
5. 能搜索代码
6. 能应用 patch
7. 能运行测试
8. 能阻止敏感文件读取
9. 能阻止危险命令
10. 能记录 session 日志
```

## 9.2 可以暂时不满足

```text
1. 多模型智能路由
2. 长上下文压缩
3. 子代理
4. MCP
5. Skills
6. Hooks
7. Web UI
8. IDE 插件
9. 企业用户权限
10. 精细化审计系统
```

---

# 10. 阶段一推荐开发顺序

```text
1. 初始化 TS monorepo
2. CLI 入口
3. 配置加载
4. ModelProvider
5. 内部消息协议
6. Tool Registry
7. list_dir
8. read_file
9. grep
10. Permission Engine 简版
11. apply_patch
12. run_shell
13. Agent Loop
14. Context Manager
15. Session 日志
16. Demo 项目
17. 集成测试
```

注意：`Agent Loop` 可以先写简版，但真正联调最好等工具和模型协议都稳定一点后再合并。

---

# 11. 阶段一不要做什么

不要在阶段一做这些：

```text
不要做 Web UI
不要做 VS Code 插件
不要做 MCP
不要做 Subagent
不要做 Skill
不要做复杂数据库
不要做插件市场
不要做权限后台
不要接太多模型
不要做企业管理台
```

阶段一的目标只有一个：

> **证明你的 Agent Runtime 能完成“读代码 → 改代码 → 跑测试 → 输出结果”的最小闭环。**
