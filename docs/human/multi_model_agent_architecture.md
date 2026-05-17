# 多模型 Agent 统一架构文档

> 版本：v1.0  
> 技术栈建议：TypeScript / Node.js  
> 目标：同时覆盖产品总览、工程分层、执行链路、依赖方向和 MVP 到长期平台的演进路径。

---

## 1. 文档定位

本文件现在是 `code-mind` 的唯一正式架构文档。

它整合了此前不同抽象层级的架构讨论，统一回答：

1. 系统的核心原则是什么
2. 正式工程分层是什么
3. 主数据流如何流转
4. 后续文档和代码实现应以什么边界落地

---

## 2. 核心结论

### 2.1 当前正式架构基线

本文件就是当前项目唯一正式架构基线。

它已经吸收了此前“产品/原则视角”和“工程分层视角”的内容，并统一收敛为：

1. 以 8 层工程分层作为代码架构基线
2. 保留“模型只负责决策，Runtime 负责执行”的主原则
3. 保留统一执行链路、统一协议和平台演进目标

---

## 3. 统一架构原则

### 3.1 模型只负责决策，Runtime 负责执行

模型不能直接操作：

- 文件系统
- Shell
- Git
- 网络
- 数据库
- MCP

模型只能输出：

- 最终回答
- 工具调用意图

真实执行链路必须是：

```text
Model Output
-> Normalizer
-> Permission / Safety
-> Tool Runtime
-> Infrastructure
-> Observation
-> Session
-> Context
-> Model
```

### 3.2 权限必须是横向强制边界

权限不能写在 Prompt 里，也不能由 UI 或 Tool Runtime 自己决定。

权限必须横向拦截：

- ToolCall
- File access
- Shell
- Patch
- Git
- MCP
- Network

### 3.3 Context 是受控资源，不是日志回放

Session 保存完整历史。

Context 只保存进入模型的工作集。

两者必须分离。

### 3.4 Runtime 是最稳定的核心

UI 会变，模型会变，工具会增多，扩展机制会继续长。

但以下核心应长期稳定：

- Agent Loop
- Session
- Permission Decision
- ToolCall / ToolResult 协议
- Context Manager

### 3.5 完整平台和 MVP 必须共用同一主干

MVP 不是另一套系统。

MVP 只是对统一架构的裁剪实现。

---

## 4. 统一架构图

推荐采用 **8 层正式工程分层**。

```text
┌────────────────────────────────────────────────────────────┐
│  8. Interface Layer                                        │
│  CLI / Web UI / VS Code / CI Bot / API Server              │
├────────────────────────────────────────────────────────────┤
│  7. Orchestration Layer                                    │
│  Task Router / Workflow / Planner / Skill / Subagent       │
├────────────────────────────────────────────────────────────┤
│  6. Agent Runtime Layer                                    │
│  Agent Loop / Session / Step Controller / Result Builder   │
├────────────────────────────────────────────────────────────┤
│  5. Context & Memory Layer                                 │
│  Prompt Builder / Project Memory / Compression / Relevance │
├────────────────────────────────────────────────────────────┤
│  4. Model Provider Layer                                   │
│  OpenAI / Claude / Qwen / DeepSeek / Local / Self Model    │
├────────────────────────────────────────────────────────────┤
│  3. Tool Runtime Layer                                     │
│  Tool Registry / Builtin Tools / MCP Tools / Executor      │
├────────────────────────────────────────────────────────────┤
│  2. Security & Permission Layer                            │
│  Policy / Approval / Audit / Sensitive Guard / Safety      │
├────────────────────────────────────────────────────────────┤
│  1. Infrastructure Layer                                   │
│  FS / Process / Git / HTTP / DB / Config / Sandbox         │
└────────────────────────────────────────────────────────────┘
```

这是正式代码架构基线。

---

## 5. 产品总览图与工程分层图的关系

### 5.1 产品总览图

用于解释系统大模块和用户视角。

```text
User Interface
-> Agent Gateway
-> Agent Orchestrator
-> Agent Runtime Core
-> Model Provider Layer
-> Tool & Data Layer
```

### 5.2 工程分层图

用于指导代码结构、模块边界和依赖方向。

```text
Interface
-> Orchestration
-> Runtime
-> Context / Model / Tool
-> Infrastructure

Security & Permission 横向拦截 Runtime -> Tool -> Infrastructure 的副作用链路
```

### 5.3 统一解释

两张图并不冲突：

- 产品总览图偏“模块认知”
- 工程分层图偏“实现约束”

项目设计、代码组织和文档基线应该以后者为准。

---

## 6. 每层职责

### 6.1 Infrastructure Layer

负责：

- 文件系统
- 进程执行
- Git/HTTP/DB 底层能力
- 配置加载
- 日志写入
- workspace / sandbox 基础服务

不负责：

- Prompt
- 模型调用
- 权限判定
- Agent Loop

### 6.2 Security & Permission Layer

负责：

- allow / ask / deny 判定
- 敏感文件保护
- 路径逃逸保护
- Shell/Git/MCP/Network 安全规则
- 审批与审计

不负责：

- 调用模型
- 执行工具
- 拼接上下文

### 6.3 Tool Runtime Layer

负责：

- Tool Registry
- Tool Schema
- Tool 执行
- Tool Result 统一格式
- Builtin/MCP/Plugin Tool 接入

不负责：

- 选择是否调用工具
- 权限绕过
- 任务规划

### 6.4 Model Provider Layer

负责：

- 多模型接入
- 请求/响应适配
- tool call normalizer
- usage/capability 解析
- model routing 与 fallback 的适配挂点

不负责：

- 任务流程
- 工具执行
- 权限判断

### 6.5 Context & Memory Layer

负责：

- system prompt 组装
- project rules 注入
- recent messages
- tool results 摘要
- memory/compression/relevance

不负责：

- 直接访问模型 API
- 决定是否执行工具

### 6.6 Agent Runtime Layer

负责：

- Agent Loop
- Step 控制
- Session 生命周期
- 调用 Context / Model / Permission / Tool
- Result Builder

这是整个系统最核心的稳定层。

### 6.7 Orchestration Layer

负责：

- task router
- planner
- reviewer / verifier
- workflow
- subagent / skill 编排

Phase 1 可极简或部分塌缩。

### 6.8 Interface Layer

负责：

- CLI / Web / IDE / CI 输入输出
- 展示中间状态
- 处理人工确认

不负责：

- 直接执行工具
- 直接调用模型

---

## 7. 统一执行链路

推荐完整执行链路：

```text
User Input
-> Interface
-> Orchestration
-> Runtime
-> Context
-> Model Provider
-> ToolCall Normalizer
-> Permission
-> Tool Runtime
-> Infrastructure
-> Tool Result
-> Session
-> Context
-> Runtime
-> Final Result
-> Interface
```

MVP 允许简化为：

```text
CLI
-> Runtime
-> Context
-> Model
-> Permission
-> Tool
-> Session
-> Runtime
```

但这只是实现上的塌缩，不是架构上的取消。

---

## 8. 依赖方向

必须遵守：

```text
Interface -> Orchestration -> Runtime
Runtime -> Context
Runtime -> Model Provider
Runtime -> Tool Runtime
Runtime -> Security & Permission
Tool Runtime -> Infrastructure
Context -> Infrastructure（仅读类能力）
Security & Permission -> Infrastructure（策略/审计/路径检查）
```

禁止：

```text
Interface -> Tool Runtime
Interface -> Model Provider
Model Provider -> Tool Runtime
Tool Runtime -> Runtime
Infrastructure -> Runtime
```

---

## 9. MVP 在统一架构中的映射

Phase 1 实际上实现的是统一架构的一个裁剪版：

- Interface Layer
已实现：CLI
- Orchestration Layer
极简实现：目前主要由 CLI + Runtime 直接选择 profile/model/mode，尚未独立成完整模块
- Agent Runtime Layer
已实现：Agent Loop、Session、Result 汇总
- Context & Memory Layer
已实现：system prompt、project rules、recent messages、tool observations
- Model Provider Layer
已实现：OpenAI-compatible / DeepSeek
- Tool Runtime Layer
已实现：5 个核心工具和 Tool Registry
- Security & Permission Layer
已实现：最小 allow/ask/deny 规则
- Infrastructure Layer
已实现但尚未完全显式抽象：FS、process、config、workspace/sandbox

因此：

> 当前 MVP 与统一架构是同一条主干，但在 Orchestration 和 Infrastructure 上仍存在“实现塌缩”，这是 Phase 1 可接受的。

---

## 10. 文档使用规则

从现在开始建议这样使用文档：

- `./multi_model_agent_architecture.md`
作为唯一推荐架构基线
- `./system_baseline.md`
作为 MVP/阶段计划的执行基线，但必须服从本文的 8 层正式架构

---

## 11. 结论

最终结论很简单：

1. 本文件是当前项目唯一正式架构文档。
2. 它同时保留了核心原则、执行链路和正式工程分层。
3. 当前项目后续所有文档和代码验证，都应以本文为准。
