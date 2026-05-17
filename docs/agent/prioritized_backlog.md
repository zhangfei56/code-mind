# Code Mind Prioritized Backlog

> 目标：把当前 `code-mind` 在 Phase 1-5 之后仍然需要完成的任务统一整理为可执行清单。  
> 用途：作为后续 agent 和人工继续开发时的统一 backlog 输入。  
> 原则：只列“还没完成”或“只完成初版”的事项，不重复已稳定完成的基础能力。

---

## 1. 使用方式

本清单按优先级分为 4 层：

- `P0`
  必须先补，否则当前平台能力会出现明显短板或无法稳定扩展。
- `P1`
  应尽快补，属于 Phase 5 主体能力的收尾。
- `P2`
  重要但不阻塞主链路，适合在 P0/P1 后集中推进。
- `P3`
  中长期项，更多是入口、体验和平台化完善。

每条任务包含：

- `ID`
- `优先级`
- `任务`
- `原因`
- `完成定义`

---

## 2. P0

### P0-01 Plugin 安装权限确认

- `原因`
  当前 `plugin install` 会直接复制并注册插件目录，但没有安装前权限展示和确认。这和第五阶段文档里的插件权限模型不一致，也是最明显的安全短板。
- `完成定义`
  1. `agent plugin install <path>` 在安装前展示插件请求的能力和权限
  2. 用户明确确认后才落盘
  3. 安装结果写入 session 或 audit
  4. 拒绝安装时不产生半安装状态

### P0-02 Plugin / Skill / Command / Subagent 扩展审计

- `原因`
  扩展平台已经成形，但扩展加载、调用、安装、启停还没有完整审计链路。
- `完成定义`
  1. plugin install / enable / disable / remove 写 audit
  2. skill load / skill run 写 audit
  3. command dispatch 写 audit
  4. subagent spawn / finish 写 audit
  5. MCP server 启动失败 / tool 调用失败写 audit

### P0-03 Web UI API 补齐 Tool Calls / Model Calls

- `原因`
  当前 Web UI 只提供 session 和 diff，距离“查看任务执行过程”还差关键信息面。
- `完成定义`
  1. 增加 `GET /api/sessions/:id/tool-calls`
  2. 增加 `GET /api/sessions/:id/model-calls`
  3. 增加 `GET /api/sessions/:id/audit`
  4. Web 页面能至少显示 session 列表、tool calls、model calls、diff

### P0-04 Approval API 与统一审批状态

- `原因`
  当前审批还主要是 CLI TTY 流程，Web UI 无法真正参与 ask 操作。
- `完成定义`
  1. 为 ask 操作分配唯一 approval id
  2. 增加 approve / reject API
  3. Session 中持久化 approval 状态
  4. 已处理审批不可重复处理

---

## 3. P1

### P1-01 HTTP Hook 实现

- `原因`
  Hook system 已支持 `command` 和 `script`，但 `http` 还是占位。
- `完成定义`
  1. 支持向配置的 URL 发送 hook payload
  2. 支持 timeout
  3. 支持解析 HookResult
  4. 失败按 `onFailure` 策略处理

### P1-02 MCP HTTP Transport

- `原因`
  当前 MCP adapter 只支持 `stdio`，文档中的 `http MCP server` 还没实现。
- `完成定义`
  1. 支持 HTTP MCP endpoint
  2. 支持 headers 配置
  3. 支持 list tools / call tool
  4. 认证失败和超时不泄露敏感信息

### P1-03 全局扩展目录加载

- `原因`
  当前扩展加载以项目级 `.agent/` 为主，全局目录 `~/.agent/{skills,plugins,agents}` 还未接入。
- `完成定义`
  1. skill engine 支持全局 skill 目录
  2. plugin manager 支持全局 plugin 目录
  3. subagent manager 支持全局 agent 目录
  4. 冲突时定义优先级：项目级覆盖全局级

### P1-04 Command 绑定的 tools / mode 真正生效

- `原因`
  Command manifest 已可解析，但 `tools` 目前更多是元数据，没有形成实际执行边界。
- `完成定义`
  1. command 可约束 mode
  2. command 可约束可见工具
  3. command 绑定的 skill 自动加载
  4. `/command` 与普通任务执行路径保持一致

### P1-05 Subagent 更细粒度隔离

- `原因`
  当前 subagent 只有工具过滤和模式降权，`allowedFiles` 等约束还未落实。
- `完成定义`
  1. 支持 `allowedFiles`
  2. 支持更细粒度 write / shell / mcp 权限
  3. 子代理上下文仍然只返回压缩 summary 给主代理

### P1-06 CI Bot 补齐 analyze-failure / suggest-fix

- `原因`
  当前只做了 `ci review`，Phase 5 文档中的另外两个初版命令还没做。
- `完成定义`
  1. `agent ci analyze-failure --test-log <path>`
  2. `agent ci suggest-fix --no-apply`
  3. 都输出 markdown 报告
  4. 默认运行在 `read_only` 或 `suggest`

---

## 4. P2

### P2-01 Web UI Session 详情页增强

- `原因`
  当前只有最小列表页，没有真正的任务详情视图。
- `完成定义`
  1. 展示 current summary
  2. 展示 tool results
  3. 展示 review / verification / diagnostics
  4. 展示 compact summary

### P2-02 Web UI Plugins / Settings 页面

- `原因`
  扩展平台已有 plugin/settings 数据，但 Web UI 还没消费。
- `完成定义`
  1. 插件列表页
  2. settings 展示页
  3. capability manifest 展示页

### P2-03 MCP 生命周期管理增强

- `原因`
  当前 adapter 可用，但 server 启停、刷新和错误恢复都还是轻量版。
- `完成定义`
  1. server 启动缓存
  2. server 刷新工具列表
  3. server 异常退出检测
  4. 更明确的错误分类

### P2-04 Hook 结果的输入/输出改写支持

- `原因`
  协议里定义了 `modify_input`、`replace_result`、`add_context`，但当前主链路还没有完整消费。
- `完成定义`
  1. BeforeModelCall 支持 `add_context`
  2. PreToolUse 支持 `modify_input`
  3. PostToolUse 支持 `replace_result`
  4. 全部动作写 audit

### P2-05 Capability Manifest 注入模型上下文

- `原因`
  当前 manifest 可输出，但没有作为运行时能力摘要回馈给模型。
- `完成定义`
  1. ContextManager 可选注入能力摘要
  2. 技能、命令、MCP、subagents 进入能力描述
  3. 注入可配置开关

---

## 5. P3

### P3-01 VS Code 插件完善为可安装扩展

- `原因`
  现在只有最小命令脚手架，尚未形成完整插件体验。
- `完成定义`
  1. 打包配置
  2. sessions 查看
  3. diff 展示
  4. patch approval UI
  5. explain / review / fix selected code 三条命令实测可用

### P3-02 Web UI 实时日志

- `原因`
  当前页面是静态轮询/静态读取级别，没有实时感。
- `完成定义`
  1. SSE 或 WebSocket
  2. model/tool/audit 流式更新
  3. approval 状态实时刷新

### P3-03 Plugin 权限分项启用

- `原因`
  当前 enable/disable 是整插件级别，还没细到 capability 级。
- `完成定义`
  1. 支持按 MCP / hooks / skills / commands 分项启用
  2. 支持 capability 冲突提示

### P3-04 Human/Agent 文档继续拆层

- `原因`
  现在 `docs/` 已经分层，但 Phase 1-5 原始阶段设计文档尚未完全纳入这一结构。
- `完成定义`
  1. 把阶段性设计文档统一归档到 `human/roadmap` 或 `agent/playbooks`
  2. 建立阶段总览索引

---

## 6. 推荐执行顺序

建议按以下顺序推进：

1. `P0-01` Plugin 安装权限确认
2. `P0-02` 扩展审计
3. `P0-03` Web UI Tool/Model Calls API
4. `P0-04` Approval API
5. `P1-01` HTTP Hook
6. `P1-02` MCP HTTP
7. `P1-03` 全局扩展目录
8. `P1-04` Command 真正约束 tools/mode
9. `P1-05` Subagent 更细粒度隔离
10. `P1-06` CI analyze-failure / suggest-fix

---

## 7. 当前判断

当前 `code-mind` 的状态可以概括为：

- Phase 1-4 主链路已经稳定
- Phase 5 主干已经打通
- 后续重点不是再加抽象，而是把扩展平台的安全、审计、审批和入口补齐

如果后续只允许做一批任务，建议优先只做 `P0`。
