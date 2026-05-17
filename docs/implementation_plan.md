# Code Mind Agent 实施计划

> 版本：v0.1  
> 目标：把系统基线、核心协议和约束矩阵转化为可执行的开发顺序、目录方案、里程碑和验收任务，作为 Phase 1 的直接开工文档。

---

## 1. 文档定位

本文件解决 4 个问题：

1. Phase 1 应该先做什么，后做什么。
2. 目录结构应该如何落地。
3. 每个阶段的产出和验收标准是什么。
4. 哪些模块现在实现，哪些模块只预留边界。

本文件与其他文档的关系如下：

- `system_baseline.md`
  定义整体分层和主数据流。

- `multi_model_agent_architecture.md`
  定义正式 8 层架构和依赖方向。

- `contracts.md`
  定义核心类型和接口协议。

- `constraints_matrix.md`
  定义实现前必须满足的系统约束。

- `implementation_plan.md`
  把上面三份文档落成具体开发计划。

---

## 2. Phase 1 目标重述

Phase 1 的交付目标不是“做一个会聊天的 CLI”，而是做一个最小闭环 code agent。

目标链路：

```text
用户输入任务
-> 模型判断
-> 工具调用
-> 权限判断
-> 执行工具
-> 读取结果
-> 生成 patch
-> 应用 patch
-> 运行测试
-> 输出总结
```

Phase 1 验收命令：

```bash
agent "修复测试失败"
```

在 demo 项目中，Agent 至少要能完成：

1. 搜索并读取相关代码
2. 找到 bug 原因
3. 生成并应用 patch
4. 运行测试
5. 根据测试结果继续修复或输出总结

---

## 3. 实现策略

### 3.1 先单包，后拆包

长期形态可以做 monorepo 多包，但当前仓库还是空白。

因此建议：

- Phase 1 先使用单包 TypeScript/Node.js CLI
- 等最小链路稳定后，再按边界拆分为 `core/models/tools/permissions/context`

原因：

- 初期变更集中在协议和循环，不适合一开始就拆过细。
- 单包更利于快速打通最小闭环。
- 只要目录边界清晰，后续拆包成本可控。

### 3.2 先固定底座，再接 Agent Loop

推荐顺序不是先写 CLI，再边补边改，而是：

1. 协议和约束
2. Workspace + Session + Permission
3. Provider + Tools
4. Context
5. Agent Loop
6. CLI 集成

原因：

- Agent Loop 是最上层组合逻辑，依赖底层边界稳定。
- 如果先写 Loop，再改权限和工具协议，返工最多。

### 3.3 Phase 1 只做一条主链路

Phase 1 不做并行工具调用，不做多 Agent，不做复杂规划器。

Phase 1 的 Agent Loop 只处理：

- 单轮模型响应
- 线性工具调用
- 单 session 顺序推进
- 到达无工具调用时结束

---

## 4. 目录建议

### 4.1 Phase 1 建议目录

```text
code-mind/
├── docs/
├── src/
│   ├── cli/
│   │   ├── index.ts
│   │   ├── parse-args.ts
│   │   └── prompt.ts
│   ├── agent/
│   │   ├── runtime.ts
│   │   ├── agent-loop.ts
│   │   ├── result-builder.ts
│   │   └── orchestrator.ts
│   ├── context/
│   │   ├── context-manager.ts
│   │   └── system-prompt.ts
│   ├── model/
│   │   ├── provider.ts
│   │   ├── openai-compatible.ts
│   │   └── normalizer.ts
│   ├── permissions/
│   │   ├── permission-engine.ts
│   │   ├── file-rules.ts
│   │   └── shell-rules.ts
│   ├── session/
│   │   ├── session-store.ts
│   │   ├── session-record.ts
│   │   └── summary-writer.ts
│   ├── tools/
│   │   ├── registry.ts
│   │   ├── tool-context.ts
│   │   ├── list-dir.ts
│   │   ├── read-file.ts
│   │   ├── grep.ts
│   │   ├── apply-patch.ts
│   │   └── run-shell.ts
│   ├── workspace/
│   │   ├── resolve-workspace.ts
│   │   ├── sandbox-path.ts
│   │   └── project-rules.ts
│   ├── config/
│   │   ├── load-config.ts
│   │   └── schema.ts
│   └── shared/
│       ├── types.ts
│       ├── errors.ts
│       ├── ids.ts
│       ├── time.ts
│       └── logger.ts
├── examples/
│   └── ts-bug-demo/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── package.json
├── tsconfig.json
```

### 4.2 目录边界说明

- `shared/`
  只放纯类型、错误和通用辅助，不放业务状态。

- `workspace/`
  负责路径规范化、越界检测、`AGENTS.md` 发现。

- `session/`
  负责落盘，不负责决定哪些内容进入模型。

- `context/`
  负责从 session 和项目规则中提取 prompt 工作集。

- `agent/`
  负责主流程编排，不直接依赖具体文件系统细节。

---

## 5. 模块实施顺序

### 5.1 Step 0: 工程初始化

目标：

- 建立 TypeScript CLI 工程
- 建立测试和构建基础设施
- 固定基本开发命令

建议内容：

- `typescript`
- `tsx` 或 `tsup`
- 自定义 Node test runner 或兼容当前 Node 版本的测试框架
- `eslint` 或 `biome`
- `zod`
- `execa`
- `yaml`

验收标准：

- `npm install`
- `npm run build`
- `npm test`

### 5.2 Step 1: 冻结共享类型

目标：

- 把 `contracts.md` 中的核心协议落成代码类型

最小产出：

- `RunMode`
- `PermissionDecision`
- `InternalMessage`
- `ToolCall`
- `ToolResult`
- `AgentSession`
- `ModelRequest`
- `ModelResponse`
- `AgentResult`

验收标准：

- 所有核心模块都依赖同一份共享类型
- 不允许在模块内重复声明同名结构

### 5.3 Step 2: Workspace 与路径沙箱

目标：

- 固定 workspace root
- 固定路径解析规则
- 阻止路径越界

最小产出：

- `resolveWorkspace(cwd)`
- `resolvePathInWorkspace(inputPath)`
- `assertPathInWorkspace(absPath)`
- `findProjectRules()`

验收标准：

- `src/a.ts` 能正确解析
- `../outside.txt` 被拒绝
- 敏感文件规则可命中

### 5.4 Step 3: Session 存储

目标：

- 每次运行生成唯一 session
- 保存消息、工具调用、工具结果、patch、summary

最小产出：

```text
.agent/sessions/<session-id>/
  messages.jsonl
  tool-calls.jsonl
  tool-results.jsonl
  patches/
  summary.md
```

验收标准：

- 运行一次最小任务后产生 session 目录
- JSONL 可解析
- patch 可单独查阅

### 5.5 Step 4: 权限引擎

目标：

- 将文件、patch、shell 权限统一收口

最小产出：

- `check(toolCall, mode, workspaceRoot)`
- 文件 deny 规则
- shell allow/ask/deny 规则
- `apply_patch` 在不同 mode 下的处理

验收标准：

- `read_file .env` -> `deny`
- `read_file src/a.ts` -> `allow`
- `run_shell npm test` -> `allow`
- `run_shell rm -rf .` -> `deny`
- `apply_patch` in `suggest` -> `ask`

### 5.6 Step 5: Tool Registry 与工具实现

目标：

- 提供统一工具注册、schema 暴露和执行入口

最小产出：

- Tool Registry
- `list_dir`
- `read_file`
- `grep`
- `apply_patch`
- `run_shell`

每个工具必须具备：

- schema
- riskLevel
- execute()
- 输出截断
- 结构化错误

验收标准：

- 5 个工具均有单元测试
- 路径越界、超时、命令拒绝等异常路径均覆盖

### 5.7 Step 6: Model Provider 与 Normalizer

目标：

- 接通 OpenAI-compatible 接口
- 把模型返回收敛为统一 `ModelResponse`

最小产出：

- `OpenAICompatibleProvider`
- `normalizeOpenAIToolCalls()`
- 文本 action fallback 解析器

验收标准：

- 普通文本响应能解析
- `tool_calls` 能转换成内部 `ToolCall`
- 原始响应 `raw` 被保留

### 5.8 Step 7: Context Manager

目标：

- 根据 session、任务、项目规则构建模型上下文

最小产出：

- system prompt
- user task
- `AGENTS.md`
- recent messages
- recent tool results

验收标准：

- demo 项目的 `AGENTS.md` 会进入上下文
- 不会把完整 session 全量塞给模型

### 5.9 Step 8: Agent Runtime

目标：

- 跑通主循环

最小产出：

- 创建 session
- 构建 context
- 调用模型
- 执行工具
- 记录 observation
- 达到无工具调用时输出 final result

验收标准：

- 可以在 mock provider 下跑完整 loop
- 步数耗尽时返回 `stopped_by_limit`

### 5.10 Step 9: CLI 集成

目标：

- 提供用户可执行入口

建议命令：

```bash
agent "<task>" --cwd . --model local --mode suggest --max-steps 10
```

验收标准：

- 参数可解析
- 能触发 runtime
- 能输出最终 summary

### 5.11 Step 10: Demo 与 E2E 验收

目标：

- 在固定 demo 上打通真实链路

建议 demo：

- `examples/ts-bug-demo`

验收标准：

- Agent 能定位 `add()` bug
- Agent 能应用 patch
- Agent 能运行测试
- 测试通过后输出总结

---

## 6. 里程碑规划

### 6.1 M1: Skeleton Ready

范围：

- 工程初始化
- 共享类型
- workspace
- session

产出：

- 项目可构建
- session 可落盘
- 路径沙箱生效

### 6.2 M2: Safe Runtime Base

范围：

- 权限引擎
- Tool Registry
- 5 个工具

产出：

- 所有基础工具可独立运行
- 所有写操作和 shell 受控

### 6.3 M3: Model Connected

范围：

- OpenAI-compatible provider
- normalizer
- 文本 fallback

产出：

- 模型可驱动工具调用

### 6.4 M4: Agent Loop Closed

范围：

- context manager
- runtime
- result builder
- CLI 接入

产出：

- 可执行最小 agent 闭环

### 6.5 M5: Demo Accepted

范围：

- demo 项目
- E2E 调试
- 文档补充

产出：

- `agent "修复测试失败"` 在 demo 上通过

---

## 7. 测试策略

### 7.1 单元测试

覆盖对象：

- 路径解析
- 权限判断
- tool schema 和 tool execution
- normalizer
- patch 应用

### 7.2 集成测试

覆盖对象：

- session 落盘
- context 构造
- runtime 单轮流程
- provider + tool + permission 协同

### 7.3 E2E 测试

覆盖对象：

- CLI -> Runtime -> Model -> Tool -> Patch -> Test -> Summary 全链路

Phase 1 至少应有：

1. 简单文本响应任务
2. 工具调用型任务
3. bugfix demo 任务

---

## 8. 风险与控制点

### 8.1 最大风险：协议未冻结就编码

风险：

- `ToolCall`、`ToolResult`、`PermissionDecision` 在实现中被隐式改写

控制：

- 先写类型，再写实现
- 每次协议变化先更新 `contracts.md`

### 8.2 最大实现风险：`apply_patch`

风险：

- patch 格式不稳定
- 匹配失败率高

控制：

- Phase 1 只支持最小 patch 格式
- patch 失败时必须结构化返回
- patch 内容必须落盘

### 8.3 最大安全风险：路径和 shell

风险：

- 越界路径
- 危险命令误执行

控制：

- 路径规范化后再判断
- shell 只允许明确 allowlist
- 高危命令始终 deny

### 8.4 最大产品风险：上下文失控

风险：

- 把过多日志和文件塞进模型

控制：

- Context Manager 统一收口
- 所有大输出必须摘要或截断

---

## 9. Phase 1 明确不做

以下内容本阶段不实现，但必须保留未来扩展边界：

- 多模型路由
- fallback 编排
- hooks 执行器
- subagent manager
- MCP adapter
- plugin system
- Browser tool
- Git 写操作
- Web UI
- VS Code 插件
- 复杂记忆压缩
- 企业鉴权、配额、远端审计

---

## 10. 开工顺序建议

如果现在开始编码，推荐直接按以下顺序推进：

1. 初始化工程和测试框架
2. 落 `shared/types.ts`
3. 落 `workspace/` 和 `session/`
4. 落 `permissions/`
5. 落 `tools/`
6. 落 `model/`
7. 落 `context/`
8. 落 `agent/runtime.ts`
9. 落 `cli/index.ts`
10. 做 `examples/ts-bug-demo` E2E 验收

---

## 11. 完成定义

Phase 1 视为完成，需要同时满足以下条件：

1. CLI 可运行
2. 单模型可调用
3. 5 个核心工具可用
4. 权限系统生效
5. session 日志完整
6. `AGENTS.md` 规则可注入
7. demo bug 可自动修复
8. 测试可执行并可根据结果继续循环
9. 最终 summary 可输出
10. 文档和实现无明显分叉

---

## 12. 下一阶段入口

Phase 1 完成后，下一阶段可以按以下顺序继续：

1. 把单包拆成多包
2. 接入 Model Router
3. 加 Hook 生命周期
4. 增加 Git / LSP / MCP 工具
5. 增加 Subagent 框架
6. 接入 Web UI 或 VS Code 插件

前提是：

- 本阶段的 Session、Permission、Tool、Runtime 协议保持不破坏兼容。
