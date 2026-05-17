# Code Mind Docs

`docs/` 现在分成两部分：

- `human/`
  面向人直接阅读。重点是系统目标、架构分层、主数据流、对齐结论和整体理解。
- `agent/`
  面向后续 agent 执行和约束消费。重点是协议、约束、实施顺序和可执行边界。

推荐阅读顺序：

1. 人读：先看 [human/README.md](./human/README.md)
2. Agent 读：先看 [agent/README.md](./agent/README.md)
3. 待办清单：看 [agent/prioritized_backlog.md](./agent/prioritized_backlog.md)

分层原则：

- 架构、结论、图示放在 `human/`
- 协议、矩阵、执行计划放在 `agent/`
- 后续新文档如果主要回答“系统是什么”，放 `human/`
- 后续新文档如果主要回答“agent 该怎么做”，放 `agent/`
