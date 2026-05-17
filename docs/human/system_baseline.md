# Code Mind Agent 系统基线

> 版本：v0.2  
> 目标：在 MVP 开始前冻结整体框架、职责边界和主数据流，保证后续 CLI、Web、IDE、多模型、MCP、Subagent 都沿同一条主干演进，而不是做出两套系统。

---

## 1. 文档定位

本文件回答 3 个问题：

1. 系统最终分层长什么样。
2. 一次完整任务的数据流如何贯穿全链路。
3. Phase 1 应该实现哪些层，哪些层只冻结接口不落地。

本文件以 `multi_model_agent_architecture.md` 为正式架构基线，也是 `agent_phase1_mvp_plan.md` 的上位约束文档。

---

## 2. 核心原则

### 2.1 模型只负责决策，Runtime 负责执行

模型不直接操作文件系统、Shell、网络、Git 或外部服务。

模型只输出两类结果：

- 最终回答
- 工具调用意图

所有真实执行必须经过 Runtime：

```text
Model Output
  -> Normalizer
  -> Permission Engine
  -> Hook Engine
  -> Tool Runtime
  -> Observation
  -> Session Store
  -> Context Manager
  -> Model
```

### 2.2 Runtime 是唯一可信执行边界

Prompt 不能视为安全机制。

安全、审计、路径沙箱、写权限、命令白名单、敏感文件保护，都必须由 Runtime 强制执行。

### 2.3 完整形态和 MVP 必须共用一条主数据流

Phase 1 不是“先写一个简化 demo，再推翻重做”。

Phase 1 只是完整系统在以下维度上的裁剪：

- 只保留 CLI
- 只接单模型
- 只保留 5 个基础工具
- 只做简版权限系统
- 只做简版上下文管理
- 不实现 Hooks/Subagents/MCP/Plugins/Web UI

但是主数据流、核心协议、权限位置、日志结构、Session 概念都必须和完整形态一致。

### 2.4 扩展能力必须挂在稳定边界上

后续新增的：

- 多模型路由
- Fallback
- Hooks
- Skills
- Subagents
- MCP
- Web UI
- VS Code 插件

都只能扩展在既有边界上，不能穿透 Runtime Core 直接调用底层能力。

---

## 3. 分层架构

正式系统分成 8 层。

```text
Interface Layer
Orchestration Layer
Agent Runtime Layer
Context & Memory Layer
Model Provider Layer
Tool Runtime Layer
Security & Permission Layer
Infrastructure Layer
```

### 3.1 Interface Layer

职责：

- 接收用户输入
- 展示中间过程
- 展示权限确认
- 展示最终结果

形态：

- CLI
- TUI
- Web UI
- VS Code Extension
- JetBrains Plugin
- CI Bot

约束：

- UI 只负责交互，不直接执行工具。
- UI 不能绕过 Gateway 或 Runtime。
- 不同 UI 共享相同的 Session 和 Result 协议。

### 3.2 Orchestration Layer

职责：

- 识别任务类型
- 选择 Agent Profile
- 选择模型
- 选择运行模式
- 决定是否拆分 Subagent
- 汇总最终结果

它不直接执行工具，也不直接接触操作系统。

### 3.3 Agent Runtime Layer

职责：

- 驱动 Agent Loop
- 管理上下文
- 管理 Session 消息
- 执行权限判定
- 调用 Hook
- 调用工具
- 记录 Observation
- 构建最终结果

这是整个系统的核心稳定层。

### 3.4 Context & Memory Layer

职责：

- system prompt 组装
- project rules 注入
- recent messages
- tool result 摘要
- memory/compression/relevance

### 3.5 Model Provider Layer

职责：

- 屏蔽厂商差异
- 统一请求格式
- 统一响应格式
- 标准化工具调用
- 暴露模型能力描述

Runtime 依赖的是 `ModelProvider` 接口，不依赖厂商 SDK。

### 3.6 Tool Runtime Layer

职责：

- 管理工具注册
- 提供统一工具 Schema
- 执行内置工具、MCP 工具和插件工具
- 格式化工具结果

扩展方向：

- Builtin Tools
- MCP Adapter
- Git/LSP/Browser/DB adapters
- Plugin Tools

### 3.7 Security & Permission Layer

职责：

- allow / ask / deny
- 敏感文件保护
- 路径逃逸检查
- Shell/Git/MCP/Network 权限
- 审批和审计

### 3.8 Infrastructure Layer

职责：

- 文件系统
- 进程执行
- Git/HTTP/DB/config
- workspace/sandbox
- session 存储底层能力

它不承担 Agent 级调度逻辑。

---

## 4. 核心运行对象

系统围绕以下 8 类对象运行：

- `UserTask`
- `AgentSession`
- `InternalMessage`
- `ModelRequest`
- `ModelResponse`
- `ToolCall`
- `ToolResult`
- `AgentResult`

它们的结构在 `../agent/contracts.md` 中冻结。

---

## 5. 完整形态主数据流

### 5.1 端到端链路

```text
用户输入任务
-> Interface Layer 接收输入
-> Orchestration Layer 识别任务类型 / 选择 Agent Profile / Model / Run Mode
-> Runtime 创建执行上下文
-> Context Manager 构造 ModelRequest
-> Model Provider 调用模型
-> Normalizer 统一解析模型返回
-> 若无工具调用，则进入 Result Builder
-> 若有工具调用，则对每个 ToolCall 依次：
   -> Permission Engine 判定 allow / ask / deny
   -> Tool Runtime 执行工具
   -> Infrastructure 真实执行
   -> Observation 写入 Session
   -> Context Manager 增量更新上下文
-> 继续下一轮 Agent Loop
-> Result Builder 生成最终结果
-> Session Logger / Audit Writer 落盘
-> Interface Layer 输出最终总结
```

### 5.2 数据流设计说明

1. Normalizer 在权限前面。
原因：所有模型差异必须先收敛成内部 `ToolCall` 再做权限判断。

2. Permission Engine 在工具执行前面。
原因：工具权限必须独立于模型。

3. Hook Engine 包在工具前后。
原因：需要稳定注入审计、格式化、输出裁剪、失败总结等确定性逻辑。

4. Observation 必须先进入 Session，再由 Context Manager 选择性注入模型。
原因：Session 是完整历史，Context 是有限窗口，二者不能混为一体。

5. Result Builder 只能读取 Runtime 产物，不应直接再触发外部执行。
原因：任务结束阶段不能隐式产生新副作用。

---

## 6. Phase 1 对完整形态的裁剪

Phase 1 只落最小闭环，但必须对齐完整架构边界。

### 6.1 Phase 1 实现范围

- UI：CLI
- Orchestration：最小任务透传，可暂不做复杂分类
- Runtime Core：Agent Loop、Context、Permission、Session、Result Builder
- Model Layer：单个 OpenAI-compatible Provider
- Tool Layer：`list_dir`、`read_file`、`grep`、`apply_patch`、`run_shell`
- Security：简版权限系统
- Infrastructure：项目文件访问、process、config、`.agent/sessions` 落盘

### 6.2 Phase 1 不实现但先冻结边界

- Model Router
- Fallback
- Hooks 执行器
- Subagent Manager
- MCP Adapter
- Plugin System
- Web UI / IDE Extension
- 复杂记忆压缩
- 企业级鉴权和配额

### 6.3 Phase 1 的目标不是“功能少”，而是“边界稳定”

以下边界在 Phase 1 必须已经存在：

- 统一 `ModelProvider`
- 统一 `ToolCall` / `ToolResult`
- 统一权限决策模型
- 统一 Session 记录格式
- 统一 Run Mode 概念
- 统一 Workspace Sandbox 规则

---

## 7. 运行模式基线

系统统一支持 5 种运行模式。

### 7.1 `read_only`

只允许读取、搜索、只读命令。

### 7.2 `suggest`

允许生成 patch，但默认不直接落盘。

### 7.3 `auto_edit`

允许自动修改文件，Shell 默认仍走权限确认。

### 7.4 `full_auto`

允许自动修改文件，并自动执行安全命令。

### 7.5 `sandbox_auto`

在隔离容器或受控环境中执行全自动任务。

约束：

- Run Mode 不是 UI 概念，而是 Runtime 权限层概念。
- 所有工具权限都必须接受 Run Mode 影响。

---

## 8. Workspace 与 Session 基线

### 8.1 Workspace

一次任务必须绑定一个明确 workspace。

基础规则：

- 所有相对路径都相对 workspace 解析
- 工具不得越过 workspace 边界
- 符号链接和路径规范化必须纳入沙箱检查

### 8.2 Session

一次任务必须创建一个唯一 session。

Session 最小职责：

- 保存消息历史
- 保存工具调用
- 保存工具结果
- 保存 patch
- 保存最终总结
- 为审计和重放提供唯一标识

---

## 9. 未来扩展挂点

### 9.1 多模型

挂在 Orchestrator 的 `Model Router` 和 Model Layer 的 `Provider Registry` 上。

### 9.2 Hooks

挂在 Runtime Core 生命周期：

- BeforeModelCall
- AfterModelCall
- PreToolUse
- PostToolUse
- BeforePatchApply
- AfterPatchApply
- SessionEnd

### 9.3 Subagents

挂在 Orchestrator 和 Runtime 之间，由 Subagent Manager 负责创建独立上下文和独立权限。

### 9.4 MCP / Plugins / Skills

统一挂在 Tool Layer 或 Context 注入层，不能单独绕开 Runtime。

---

## 10. MVP 开始前必须冻结的决策

以下内容必须在开工前确定，不应边写边改：

1. 系统分层和职责边界
2. 主数据流
3. `ModelProvider` 基础接口
4. `ToolCall` / `ToolResult` 基础协议
5. `PermissionDecision` 类型
6. Run Mode 语义
7. Workspace 沙箱规则
8. Session 日志结构
9. `AGENTS.md` 注入位置
10. Phase 1 支持的最小工具集合

---

## 11. 建议实施顺序

按照依赖关系，先后顺序建议如下：

1. 冻结 `../agent/contracts.md`
2. 冻结 `../agent/constraints_matrix.md`
3. 初始化单包 CLI 工程
4. 实现 Session、Config、Workspace Sandbox
5. 实现 Model Provider 和 Normalizer
6. 实现 Tool Registry 和 5 个核心工具
7. 实现 Permission Engine
8. 实现 Context Manager
9. 实现 Agent Loop
10. 用 demo 项目做闭环验收

---

## 12. 与现有文档关系

- `./multi_model_agent_architecture.md`
  提供正式统一架构基线。

- `agent_phase1_mvp_plan.md`
  提供 Phase 1 的交付范围、工具集合和验收标准。

- `./system_baseline.md`
  负责在统一架构与阶段实现之间建立稳定主干，保证 MVP 与最终平台不是两套系统。
