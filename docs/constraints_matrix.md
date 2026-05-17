# Code Mind Agent 约束矩阵

> 版本：v0.1  
> 目标：在 MVP 前统一整理系统约束，避免开发过程中把安全、日志、上下文、扩展性问题留给后面返工。

---

## 1. 文档范围

本文件覆盖以下约束域：

- 架构约束
- Workspace 与路径约束
- 模型约束
- 工具约束
- 权限约束
- Session 与审计约束
- 上下文约束
- 运行模式约束
- 扩展约束
- Phase 1 范围约束

每条约束分为：

- `约束`
- `原因`
- `Phase 1 要求`

---

## 2. 架构约束

| 编号 | 约束 | 原因 | Phase 1 要求 |
| --- | --- | --- | --- |
| A-01 | 模型不能直接执行系统操作 | 避免绕过权限和审计 | 必须满足 |
| A-02 | Runtime 是唯一执行边界 | 所有安全策略必须集中生效 | 必须满足 |
| A-03 | 主数据流必须稳定 | 防止 MVP 和正式版变成两套系统 | 必须满足 |
| A-04 | UI 不能直接调用工具 | 防止 Web/CLI/IDE 分叉出不同执行逻辑 | 必须满足 |
| A-05 | Orchestrator 不直接执行工具 | 调度和执行职责必须分离 | 必须满足 |
| A-06 | Session 是真实历史，Context 是派生视图 | 防止上下文裁剪破坏审计能力 | 必须满足 |

---

## 3. Workspace 与路径约束

| 编号 | 约束 | 原因 | Phase 1 要求 |
| --- | --- | --- | --- |
| W-01 | 每次任务必须绑定一个 workspace root | 所有路径判断必须有边界 | 必须满足 |
| W-02 | 所有相对路径都相对 workspace 解析 | 防止路径语义漂移 | 必须满足 |
| W-03 | 工具不得访问 workspace 之外的路径 | 防止越界读写 | 必须满足 |
| W-04 | 路径检查必须基于规范化后的绝对路径 | 防止 `../` 绕过 | 必须满足 |
| W-05 | 符号链接必须纳入沙箱判断 | 防止通过 symlink 逃逸 | 至少设计上冻结 |
| W-06 | 敏感文件规则优先于普通 allow 规则 | 防止误读密钥和配置 | 必须满足 |

敏感文件最小 deny 集合：

```text
.env
.env.*
secrets/**
**/*.pem
**/*.key
```

---

## 4. 模型约束

| 编号 | 约束 | 原因 | Phase 1 要求 |
| --- | --- | --- | --- |
| M-01 | 必须存在统一 `ModelProvider` 接口 | 屏蔽厂商差异 | 必须满足 |
| M-02 | Runtime 不能直接依赖具体厂商响应格式 | 避免业务层被 SDK 绑定 | 必须满足 |
| M-03 | 所有模型返回必须标准化成 `ModelResponse` | 后续多模型共用 Agent Loop | 必须满足 |
| M-04 | 必须允许“无 tool_call，仅文本 action”fallback | 兼容弱工具调用模型 | 建议满足 |
| M-05 | 必须保存原始 `raw` 响应 | 便于审计和故障分析 | 必须满足 |
| M-06 | 必须定义 `ModelCapabilities` | 后续做模型路由和能力选择 | 至少设计上冻结 |
| M-07 | 模型切换不能改变 Runtime 核心逻辑 | 保证主循环稳定 | 必须满足 |

---

## 5. 工具约束

| 编号 | 约束 | 原因 | Phase 1 要求 |
| --- | --- | --- | --- |
| T-01 | 所有工具必须注册到统一 Tool Registry | 工具发现和执行入口统一 | 必须满足 |
| T-02 | 所有工具必须有 schema | 便于模型调用和参数校验 | 必须满足 |
| T-03 | 所有工具必须声明风险级别 | 权限引擎需要风险输入 | 必须满足 |
| T-04 | 所有工具必须返回统一 `ToolResult` | 便于模型回填和日志记录 | 必须满足 |
| T-05 | 工具错误必须结构化返回 | 便于 Agent Loop 继续处理 | 必须满足 |
| T-06 | 工具输出必须支持截断 | 防止上下文爆炸 | 必须满足 |
| T-07 | 工具执行超时必须可控 | 防止长时间卡死 | 必须满足 |
| T-08 | 工具必须区分读、写、执行、副作用 | 权限判断需要明确分类 | 至少设计上冻结 |

Phase 1 核心工具范围：

- `list_dir`
- `read_file`
- `grep`
- `apply_patch`
- `run_shell`

Phase 1 明确不做：

- MCP
- Browser
- DB
- LSP
- Git 写操作
- Plugin Tools

---

## 6. 权限约束

| 编号 | 约束 | 原因 | Phase 1 要求 |
| --- | --- | --- | --- |
| P-01 | 权限系统必须独立于 Prompt | Prompt 不是安全边界 | 必须满足 |
| P-02 | 权限决策只允许 `allow / ask / deny` 三态 | 保持策略清晰和可测 | 必须满足 |
| P-03 | 每个 ToolCall 执行前都必须经过权限检查 | 防止漏判 | 必须满足 |
| P-04 | Run Mode 必须影响权限结果 | 模式不应只是 UI 参数 | 必须满足 |
| P-05 | 默认拒绝高危命令 | 防止破坏性操作 | 必须满足 |
| P-06 | 写文件权限必须独立于读文件权限 | 避免“能读即能写” | 必须满足 |
| P-07 | 网络权限必须明确声明 | 防止后续工具偷联网 | 至少设计上冻结 |
| P-08 | Git、MCP、Shell 权限必须可独立配置 | 未来扩展需要分域控制 | 至少设计上冻结 |

Phase 1 shell 基线：

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

默认拒绝：

```text
rm -rf *
sudo *
git push *
curl * | sh
wget * | bash
chmod 777 *
```

---

## 7. Session 与审计约束

| 编号 | 约束 | 原因 | Phase 1 要求 |
| --- | --- | --- | --- |
| S-01 | 每次运行必须有唯一 session id | 支持追踪与重放 | 必须满足 |
| S-02 | 用户消息、模型消息、工具调用、工具结果必须落盘 | 审计和排错基础 | 必须满足 |
| S-03 | patch 必须单独归档 | 便于回溯代码变更 | 必须满足 |
| S-04 | 最终结果必须保存 summary | 便于检索和复盘 | 必须满足 |
| S-05 | 日志应可读且可机读 | 兼顾调试和后续平台化 | 必须满足 |
| S-06 | 模型原始返回建议保留 | 故障分析需要 | 建议满足 |
| S-07 | 工具失败和权限拒绝必须被明确记录 | 否则任务状态不可解释 | 必须满足 |

Phase 1 建议目录：

```text
.agent/sessions/<session-id>/
  messages.jsonl
  tool-calls.jsonl
  tool-results.jsonl
  patches/
  summary.md
```

---

## 8. 上下文约束

| 编号 | 约束 | 原因 | Phase 1 要求 |
| --- | --- | --- | --- |
| C-01 | Context 不能直接塞入所有文件内容 | Token 成本不可控 | 必须满足 |
| C-02 | Context 只能由 Context Manager 统一构造 | 防止各处拼 Prompt | 必须满足 |
| C-03 | `AGENTS.md` 必须有固定注入位置 | 项目规则需要稳定生效 | 必须满足 |
| C-04 | Tool result 必须可摘要化 | 防止 Shell 和搜索结果淹没上下文 | 必须满足 |
| C-05 | Recent Messages 和 Compressed History 必须逻辑分离 | 长会话扩展需要 | 至少设计上冻结 |
| C-06 | Session 全量历史不能直接等于模型上下文 | 审计和成本目标冲突 | 必须满足 |

Phase 1 最小上下文建议：

```text
System Prompt
+ Agent Profile
+ User Task
+ AGENTS.md 规则
+ Recent Messages
+ Recent Tool Results
```

---

## 9. 运行模式约束

| 编号 | 约束 | 原因 | Phase 1 要求 |
| --- | --- | --- | --- |
| R-01 | Run Mode 是权限层概念，不是展示层概念 | 保证行为一致 | 必须满足 |
| R-02 | `read_only` 不能落盘修改 | 保证分析场景安全 | 必须满足 |
| R-03 | `suggest` 下 patch 默认 ask | 防止误改文件 | 必须满足 |
| R-04 | `auto_edit` 允许安全写操作 | 形成最小自动修复闭环 | 必须满足 |
| R-05 | `full_auto` 仍不能绕过 deny 规则 | 高危操作必须始终受限 | 必须满足 |
| R-06 | `sandbox_auto` 依赖隔离环境，不是权限豁免 | 避免语义误解 | 至少设计上冻结 |

---

## 10. 扩展约束

| 编号 | 约束 | 原因 | Phase 1 要求 |
| --- | --- | --- | --- |
| E-01 | 多模型必须通过 Provider Registry 扩展 | 防止业务层写厂商分支 | 至少设计上冻结 |
| E-02 | Hooks 只能挂在 Runtime 生命周期 | 保持确定性控制集中 | 至少设计上冻结 |
| E-03 | Subagent 必须拥有独立上下文和独立权限 | 防止主代理状态污染 | 至少设计上冻结 |
| E-04 | MCP 必须作为 Tool Layer 扩展 | 不允许单独开后门 | 至少设计上冻结 |
| E-05 | Web/IDE 只能复用 Runtime API | 防止产品形态分叉 | 至少设计上冻结 |
| E-06 | 插件和技能不能绕过权限系统 | 防止扩展破坏安全模型 | 至少设计上冻结 |

---

## 11. Phase 1 范围约束

| 编号 | 约束 | 原因 | 要求 |
| --- | --- | --- | --- |
| V-01 | Phase 1 只做单模型 | 降低变量数量 | 必须满足 |
| V-02 | Phase 1 不做 MCP | 聚焦主闭环 | 必须满足 |
| V-03 | Phase 1 不做 Subagents | 避免复杂度提前爆炸 | 必须满足 |
| V-04 | Phase 1 不做 Hooks 执行器 | 先固定挂点和协议 | 必须满足 |
| V-05 | Phase 1 不做 Web UI / IDE | 优先 CLI 验证 | 必须满足 |
| V-06 | Phase 1 不做复杂上下文压缩 | 先验证基础 Context 机制 | 必须满足 |
| V-07 | Phase 1 不做企业鉴权和配额 | 本地单用户先闭环 | 必须满足 |

---

## 12. 开发前检查清单

在正式开始实现前，以下问题必须全部回答清楚：

1. Workspace root 如何确定？
2. `ToolCall` 和 `ToolResult` 是否已冻结？
3. `PermissionDecision` 是否只保留三态？
4. `RunMode` 语义是否已写清？
5. Session 目录结构是否已固定？
6. `AGENTS.md` 何时注入上下文？
7. `apply_patch` 用什么 patch 格式？
8. `run_shell` 的 allow/ask/deny 初始规则是否已写清？
9. 路径沙箱是否包含符号链接处理策略？
10. Provider 是否保留原始 `raw` 返回？

---

## 13. 推荐执行顺序

最稳妥的实现顺序如下：

1. 固定 `system_baseline.md`
2. 固定 `contracts.md`
3. 固定本约束矩阵
4. 先实现 Session、Path Sandbox、Permission Engine
5. 再实现 Provider 和 Tools
6. 最后接 Agent Loop 和 CLI

原因：

- Session 和 Path Sandbox 是底座。
- Permission 决定工具怎么设计。
- Provider 和 Tool 协议稳定后，Agent Loop 才不会反复改。
