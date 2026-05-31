# code-mind 用户指南

> scope: **user-guide** — 唯一用户操作文档  
> audience: 开发者、日常使用 code-mind 的用户

本文说明如何**编译**、**配置模型**、以及如何使用 **`code-mind` CLI** 完成代码任务。

命令结构参考 [OpenCode CLI](../../opencode/packages/web/src/content/docs/cli.mdx)（MIT），底层为 code-mind 自研 runtime（Node + 文件 session），**非** OpenCode 拷贝。

---

## 快速开始

```bash
cd code-mind
nvm use 22.22.0
pnpm install && pnpm build

export DEEPSEEK_API_KEY=sk-...
code-mind run "explain this repo" --cwd .
code-mind --help
code-mind --version
```

---

## 0. 与 OpenCode CLI 对照

| OpenCode | code-mind | 说明 |
|----------|-----------|------|
| `opencode`（默认 TUI） | `code-mind` | 默认进入交互 REPL（readline，非 OpenTUI） |
| `opencode run "task"` | `code-mind run "task"` | 非交互单次任务 |
| `opencode session list/delete` | `code-mind session list/delete` | `sessions` 为兼容别名 |
| `opencode export/import` | `code-mind export/import` | Session JSON 导入导出 |
| `opencode models` | `code-mind models` | 列出 config 中的模型 |
| `opencode providers` / `auth` | `code-mind providers list` / `auth list` | 查看 provider 配置 |
| `opencode serve` / `web` | `code-mind serve` / `web start` | HTTP API + Web UI |
| `opencode mcp` | `code-mind mcp list/add` | MCP 配置 |
| `opencode agent list` | `code-mind agent list` | 子 agent 列表 |
| `opencode plugin` | `code-mind plugin` / `plug` | 插件管理 |
| `opencode attach` / `acp` / `pr` | — | **尚未实现** |
| `opencode upgrade` / `uninstall` | — | 分发工具，不适用 monorepo 开发态 |
| `opencode debug *` | `code-mind debug config/info` | 精简版 debug |

**兼容写法**（自动映射，无需记两套命令）：

```bash
code-mind "fix tests"              # → code-mind run "fix tests"
code-mind edit "fix tests"         # → code-mind run "fix tests" --mode edit
code-mind sessions list            # → code-mind session list
code-mind serve --port 3847        # → code-mind web start --port 3847
```

> **注意：** `code-mind agent list` 是「管理子 agent」子命令；若要以 **agent 模式**跑任务，请用 `code-mind run "task" --mode agent` 或 `code-mind agent "task"`（无 `list/show/...` 子命令时）。

---

## 1. 命令总览

运行 `code-mind --help` 可查看完整树。顶层命令如下：

| 命令 | 说明 |
|------|------|
| `code-mind` | 默认：启动交互 REPL |
| `code-mind run <task>` | 非交互执行单次任务 |
| `code-mind session …` | Session 管理（list / show / delete / resume / revert / execute） |
| `code-mind export [sessionId]` | 导出 session 为 JSON |
| `code-mind import <file>` | 从 JSON 导入 session |
| `code-mind models [provider]` | 列出已配置模型 |
| `code-mind providers list` | 列出 provider（别名 `auth list`） |
| `code-mind config show` | 打印当前加载的配置 |
| `code-mind verify` | 运行 verification pipeline |
| `code-mind review` | 审查当前 git diff |
| `code-mind capabilities` | 输出工具 / 模型 / 扩展能力 JSON |
| `code-mind mcp list/add` | MCP 服务器配置 |
| `code-mind hooks list` | 列出 hooks |
| `code-mind skills list/show` | Skill 发现 |
| `code-mind skill run <name> [task]` | 带 skill 内容跑 agent |
| `code-mind agent list` | 列出子 agent 定义 |
| `code-mind plugin …` | 插件 install / list / enable / disable / remove（别名 `plug`） |
| `code-mind web start` | 启动 HTTP API + Web UI |
| `code-mind serve` | 同上（`web start` 别名） |
| `code-mind ci review` | CI markdown review |
| `code-mind debug config/info` | 调试信息 |

### 1.1 全局选项

多数命令共享以下选项（`code-mind run --help` 可见完整列表）：

| 选项 | 短选项 | 说明 | 默认 |
|------|--------|------|------|
| `--help` | `-h` | 帮助（含 ASCII logo） | — |
| `--version` | `-v` | 版本号 | — |
| `--cwd <path>` | | 工作区根目录 | 当前目录 |
| `--model <name>` | `-m` | 模型 config 键或 `provider:model` | `default_model` |
| `--mode <mode>` | | `ask` / `plan` / `edit` / `agent` | **`edit`** |
| `--max-steps <n>` | | 最大推理步数 | `10` |
| `--continue` | `-c` | 继续最近 session | 关 |
| `--session <id>` | `-s` | 继续指定 session | — |
| `--fork` | | 继续前 fork 出新 session | 关 |
| `--file <path>` | `-f` | 从文件读取 prompt | — |
| `--json` | | 结构化 JSON 输出（无进度条） | 关 |
| `--verbose` | | 显示逐步 tool/step 进度与完整 footer（L2） | 关 |
| `--trace` | | 显示 token/context 追踪细节（L3） | 关 |
| `--plan` | | plan-first：先 plan 再 execute | 关 |
| `--worktree` | | 在 git worktree 中执行 | 关 |
| `--skill <name>` | | 任务前注入指定 skill | — |
| `--auto` | | 将 `edit` 提升为 `agent` 模式 | 关 |

---

## 2. 环境要求

| 项 | 要求 |
|----|------|
| Node.js | **≥ 22**（推荐与 [.nvmrc](../.nvmrc) 一致：`22.22.0`） |
| 包管理 | **pnpm**（通过 Corepack 启用） |

```bash
nvm use 22.22.0
corepack enable pnpm
```

---

## 3. 编译与安装

在仓库根目录 `code-mind/` 执行：

```bash
pnpm install
pnpm build
pnpm test    # 可选
```

编译产物：

- CLI 入口：`apps/cli/dist/cli/index.js`
- 根目录 `package.json` 注册 bin：`code-mind` → 上述路径

### 3.1 三种运行方式

**A — 开发模式**（从 monorepo 根目录运行，`--cwd .` 指向仓库根）

```bash
pnpm dev -- run "explain this repo" --cwd .
pnpm dev -- config show
```

**B — 编译产物**

```bash
node apps/cli/dist/cli/index.js run "fix test" --cwd .
```

**C — 全局链接（可选）**

```bash
pnpm build
pnpm link --global   # 或 npm link
code-mind --help
```

### 3.2 常用根脚本

| 命令 | 说明 |
|------|------|
| `pnpm build` | 编译 monorepo |
| `pnpm test` | build + 测试 |
| `pnpm dev -- run "<task>" --cwd .` | 开发模式跑任务 |
| `pnpm web -- .` | 直接启动 api-server（**默认端口 3847**） |

> **端口说明：** `code-mind serve` / `web start` 默认 **3000**；`pnpm web` 走 `apps/api-server`，默认 **3847**。生产/本地联调建议显式指定：`code-mind serve --port 3847 --cwd .`。

---

## 4. 配置

CLI 运行前必须能解析到**至少一个模型**。优先级：

1. `~/.agent/config.yaml`（推荐）
2. 环境变量（CI / 临时覆盖）

### 4.1 配置文件 `~/.agent/config.yaml`

```yaml
default_model: deepseek

models:
  deepseek:
    provider: openai-compatible
    base_url: https://api.deepseek.com
    api_key: sk-your-key
    model: deepseek-chat

  qwen:
    provider: qwen
    base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
    api_key: sk-your-dashscope-key
    model: qwen3-coder-plus
```

| YAML 字段 | 含义 |
|-----------|------|
| `default_model` | 默认 models 键名 |
| `models.<name>.provider` | `openai-compatible` / `qwen` / `local` |
| `models.<name>.base_url` | API 地址 |
| `models.<name>.api_key` | API Key |
| `models.<name>.model` | 上游模型 ID |

```bash
code-mind config show
code-mind models
code-mind providers list
```

### 4.2 环境变量

**DeepSeek（最简）**

```bash
export DEEPSEEK_API_KEY=sk-...
export DEEPSEEK_BASE_URL=https://api.deepseek.com   # 可选
export DEEPSEEK_MODEL=deepseek-chat                  # 可选
```

**通义 / DashScope**

```bash
export QWEN_API_KEY=sk-...          # 或 DASHSCOPE_API_KEY
export QWEN_MODEL=qwen3-coder-plus  # 可选
```

**本地 Ollama**

```bash
export LOCAL_MODEL_NAME=llama3.2
export LOCAL_MODEL_BASE_URL=http://127.0.0.1:11434/v1
export LOCAL_MODEL_API_KEY=ollama
```

**通用 OpenAI 兼容**

```bash
export AGENT_MODEL_BASE_URL=https://api.example.com/v1
export AGENT_MODEL_API_KEY=sk-...
export AGENT_MODEL_NAME=gpt-4o
```

### 4.3 指定模型

`--model` 通常是 config 里 models 的**键名**：

```bash
code-mind run "refactor utils" --model deepseek --cwd .
```

也支持 selector（走环境变量，不读 config 键）：

```bash
code-mind run "demo" --model qwen:qwen3-coder-plus --cwd .
code-mind run "demo" --model local:llama3.2 --cwd .
```

### 4.4 工作区数据目录

在 `--cwd` 指向的项目根下：

```text
<project>/.agent/
  sessions/          # session 记录（manifest、summary、plan 等）
  skills/            # 自定义 skill
  commands/          # 斜杠命令定义
  settings.yaml      # MCP、扩展（由 mcp / plugin 命令维护）
```

Session 由 runtime 自动持久化，无需手动建目录。

### 4.5 子代理（Sub-agent）

主 agent 在 **plan / edit / agent** 模式下可通过 `run_subagent` 委派只读子任务；**ask 模式不提供该工具**。

| 内置 agent | 用途 | 步数预算 |
|------------|------|----------|
| `explore` | 跨目录只读搜索、调用链梳理 | 默认 4 步（最大 6） |
| `plan` | 只读实现方案调研 | 默认 5 步（最大 7） |

```bash
# 列出内置 + .agent/agents/*.yaml 自定义子代理
code-mind agent list --cwd .

# 自定义子代理示例：.agent/agents/code-reviewer.yaml
# name: code-reviewer
# mode: ask
# tools: [read_file, grep, git_diff]
```

**何时会 spawn：** 任务已收窄为**可验收的子问题**（例如「从 CLI 追到 PermissionEngine 的审批链路」），且广域 read/grep 会污染主 session。

**何时不会：** 模糊任务（「找 bug」）、1–3 文件小范围、或 ask 模式。

完整策略与 Demo 见 **[subagent.md](./architecture/domains/subagent.md)**。

---

## 5. 运行任务

### 5.1 非交互（推荐 OpenCode 风格）

> 输出格式完整规范见 **[architecture/domains/cli-ui.md](./architecture/domains/cli-ui.md)**（think / step / context / result、L0–L3 披露层级）。

**Mock UI 预览（无需 API key）：**

```bash
code-mind mock list
code-mind mock run "explain this repo" --cwd .              # L0 默认
code-mind mock run "explain this repo" --cwd . --verbose    # L2
code-mind mock run --scenario approval --cwd .              # 审批 UI
code-mind mock run --scenario shell-failure --cwd .         # 失败 UI
code-mind mock run --delay 250 --cwd .                      # 慢速 spinner 演示
```

默认 run 的 stderr 采用 **journal v3**：每 step 显示 **意图叙述 + 固定高度活动窗（工具名与参数）+ 阶段结论**；stdout 仍仅输出回答。更细日志用 `--verbose`：

```text
  step 1/12 · exploring
    model → 1 tool
    tool · list_dir ✓
  step 2/12 · exploring
    model → 2 tools
    tool · read_file ✓
    tool · read_file ✓
✓ 5 steps · success
```

```bash
code-mind run "explain this repo" --cwd .              # 安静模式
code-mind run "explain this repo" --cwd . --verbose    # 逐步进度

code-mind run "fix the failing test" --cwd . --mode edit
code-mind run "explain auth flow" --mode ask --cwd .

# 继续 session（Claude Code / OpenCode 风格）
code-mind -c --cwd .
code-mind -s session_abc123 "follow up question" --cwd .
code-mind -c --fork "try a different approach" --cwd .

# 从文件读 prompt + JSON 输出
code-mind run -f task.md --json --cwd .
```

### 5.2 兼容写法

```bash
code-mind "fix tests" --cwd .              # 等同 run，默认 mode=edit
code-mind edit "fix tests" --cwd .
code-mind ask "这个项目做什么？" --cwd .
code-mind plan "设计缓存层" --cwd .
code-mind run "实现登录 API" --mode agent --cwd .
```

### 5.3 Agent 模式说明

| 模式 | 用途 |
|------|------|
| `ask` | 只读分析，不改文件 |
| `plan` | 出计划，不写代码 |
| `edit` | 改代码（默认），高风险操作需审批 |
| `agent` | 更激进的自动执行语义 |

`--auto` 会把 `edit` 提升为 `agent`。

### 5.4 示例

```bash
# 只读分析
code-mind ask "解释 packages/core 的职责" --cwd .

# plan-first（TTY 下会 prompt 确认 plan）
code-mind run "给 parse-args 补单元测试" --plan --cwd .

# 独立 worktree
code-mind run "重构 session store" --worktree --mode agent --cwd .

# 限制步数
code-mind edit "修 lint" --max-steps 6 --cwd .
```

退出码：`0` = `effectiveStatus === success`；非 0 = 失败、被拒或部分完成。

---

## 6. 交互模式（REPL）

**默认行为：** 无子命令直接启动 REPL（等同 OpenCode 无参启动 TUI）：

```bash
code-mind --cwd . --mode edit --max-steps 12
```

以 `/` 开头的控制命令：

| 命令 | 作用 |
|------|------|
| `/help` | 帮助 |
| `/status` | cwd、model、session、步数 |
| `/sessions` | 最近 session |
| `/approvals` | 待审批工具调用 |
| `/approve [id]` / `/deny [id]` | 批准 / 拒绝 |
| `/abort` | 中止当前 turn |
| `/resume <session-id>` | 恢复 session |
| `/model <name>` | 切换模型 |
| `/cwd <path>` | 切换工作区 |
| `/max-steps <n>` | 调整步数上限 |
| `/new` | 清空 session 绑定 |
| `/exit` | 退出 |

REPL 内**不能**切换 mode；需重启并指定 `--mode` 或使用 `code-mind ask|plan|edit|agent` 兼容写法。

---

## 7. Session 管理

```bash
code-mind session list --cwd .
code-mind session list --format json --cwd .
code-mind session show <session-id> --cwd .
code-mind session delete <session-id> --cwd .
code-mind session resume <session-id> --cwd . --max-steps 10
code-mind session revert <session-id> --cwd .
code-mind session execute <plan-session-id> --mode edit --cwd .

# 导入 / 导出
code-mind export <session-id> --cwd . > backup.json
code-mind import backup.json --cwd .

# 兼容别名
code-mind sessions list --cwd .
code-mind sessions execute <plan-session-id> --mode edit --cwd .
```

Plan-first 会产生 linked session：`planSessionId` / `executeSessionId` 写在 manifest 里。若 plan 后未自动 execute，用 `session execute` 手动触发。

---

## 8. 工程与扩展命令

```bash
# Verification（按需开启）
code-mind verify --cwd .
code-mind verify --cwd . --test --lint --build

# Review
code-mind review --cwd .

# 能力清单
code-mind capabilities --cwd .

# Skills
code-mind skills list --cwd .
code-mind skills show <name> --cwd .
code-mind skill run <name> "按 skill 执行" --cwd .

# MCP → .agent/settings.yaml
code-mind mcp list --cwd .
code-mind mcp add github --cwd .

# Hooks / 子 agent / 插件
code-mind hooks list --cwd .
code-mind agent list --cwd .
code-mind plugin list --cwd .
code-mind plugin install <path-or-name> --cwd .

# HTTP 服务
code-mind serve --cwd . --port 3847
code-mind web start --cwd . --port 3847
# 或
pnpm web -- .
```

**Web API 常用端点：**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sessions` | session 列表 |
| POST | `/api/runs` | 异步启动 run（202 + poll） |
| GET | `/api/runs/:id` | 查询 run 状态 |
| WS | `/ws/runs/:id` | 流式事件 |

---

## 9. 典型工作流

### 9.1 本地改 bug

```bash
export DEEPSEEK_API_KEY=sk-...
pnpm build
code-mind edit "修复 tests/unit/foo.test.ts 的失败用例" --cwd . --max-steps 8
code-mind verify --cwd . --test
```

### 9.2 Plan → 审批 → Execute

```bash
code-mind run "设计并实现缓存模块" --plan --cwd .
# TTY 下确认 plan 后继续 execute

code-mind session list --cwd .
code-mind session execute session_plan_xxx --mode edit --cwd .
```

### 9.3 长时间调试（REPL + 审批）

```bash
code-mind --mode edit --cwd .
# 输入任务；apply_patch 等高风险工具出现时用 /approve
```

---

## 10. 故障排查

| 现象 | 处理 |
|------|------|
| `No model configuration found` | 配置 `~/.agent/config.yaml` 或设置 `DEEPSEEK_API_KEY` |
| `Unknown model configuration: xxx` | `code-mind config show` / `code-mind models` 核对键名 |
| `command not found: code-mind` | 在仓库根执行 `pnpm install && pnpm build`；或 `pnpm link --global` |
| Exit code 1 但看似改完 | 看输出 `Termination:`；`effectiveStatus` 可能与原始 status 不同 |
| Session 找不到 | 确认 `--cwd` 与创建时一致（`<cwd>/.agent/sessions/`） |
| 端口冲突 | `code-mind serve` 默认 3000；`pnpm web` 默认 3847；用 `--port` 显式指定 |
| 编译失败 | `node -v` ≥ 22；删 `node_modules` 后 `pnpm install && pnpm build` |

---

## 11. 相关文档

- [architecture/packages.md](./architecture/packages.md) — 包映射与实现状态
- [backlog.md](./backlog.md) — 待完成任务
- [AGENTS.md](../AGENTS.md) — 贡献者入口与源码路径
