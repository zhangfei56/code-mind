# Code Mind Agent Docs

这一部分面向后续 agent 消费，目标是让 agent 在实现、重构或校验时有稳定输入。

推荐阅读顺序：

1. [contracts.md](./contracts.md)
   核心协议和稳定类型边界。
2. [constraints_matrix.md](./constraints_matrix.md)
   运行、安全、权限、路径、扩展约束。
3. [implementation_plan.md](./implementation_plan.md)
   实施顺序、里程碑、模块职责和验收路径。
4. [prioritized_backlog.md](./prioritized_backlog.md)
   当前剩余任务的优先级清单。

使用原则：

- 需要知道“数据结构该长什么样”时，优先读 `contracts.md`
- 需要知道“什么不能做”时，优先读 `constraints_matrix.md`
- 需要知道“下一步先做什么”时，优先读 `implementation_plan.md`
- 需要知道“后续先补哪些缺口”时，优先读 `prioritized_backlog.md`

后续新增面向 agent 的文档，建议保持以下风格：

- 少背景，多约束
- 少宣传，多输入输出
- 明确优先级、前置条件和验收标准
