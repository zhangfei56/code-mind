import type { CompactionSummarizeInput, InternalMessage } from "@code-mind/shared";

function formatEvictedMessages(messages: InternalMessage[]): string {
  if (messages.length === 0) {
    return "(none)";
  }
  return messages
    .filter((message) => message.content.trim().length > 0)
    .map(
      (message) =>
        `[${message.role}] ${message.content.trim().replace(/\s+/g, " ").slice(0, 800)}`,
    )
    .join("\n\n");
}

function formatEvictedObservations(input: CompactionSummarizeInput): string {
  if (input.evictedObservations.length === 0) {
    return "(none)";
  }
  return input.evictedObservations
    .map((observation) => {
      const detail = observation.toolResult.success
        ? observation.toolResult.output
        : (observation.toolResult.error ?? observation.toolResult.output);
      return `[${observation.toolCall.name}] ${detail.replace(/\s+/g, " ").slice(0, 800)}`;
    })
    .join("\n\n");
}

function buildSystemPrompt(locale: "zh" | "en"): string {
  if (locale === "zh") {
    return [
      "你是会话压缩助手。将对话与工具证据蒸馏成 rolling Markdown 摘要。",
      "必须保留：用户任务、关键决策、未解决问题、验证结论、关键路径/文件/命令（一行证据）。",
      "必须丢弃：完整 tool stdout、重复 read、权限流程细节（除非仍 pending）、无关探索。",
      "不要写入 modifiedFiles 清单、step 预算或 volatile progress。",
      "输出必须以 `# Session compaction (rolling)` 开头，包含 ## Task / ## Decisions / ## Open issues / ## Evidence 等节。",
      "只输出 Markdown，不要解释。",
    ].join("\n");
  }

  return [
    "You compress an agent session into a rolling Markdown summary.",
    "Keep: user task, key decisions, open issues, verification outcomes, evidence-level paths/files/commands (one line each).",
    "Drop: full tool stdout, duplicate reads, approval chatter (unless still pending), unrelated exploration.",
    "Do not include modifiedFiles lists, step budgets, or volatile progress.",
    "Start with `# Session compaction (rolling)` and use ## Task / ## Decisions / ## Open issues / ## Evidence sections.",
    "Output Markdown only, no preamble.",
  ].join("\n");
}

function buildUserPrompt(input: CompactionSummarizeInput): string {
  const locale = input.locale ?? "en";
  const previous =
    input.previousSummary?.trim() ||
    (locale === "zh" ? "(无)" : "(none)");

  if (locale === "zh") {
    return [
      "## 用户任务",
      input.taskText,
      "",
      "## 已有 rolling summary",
      previous,
      "",
      "## 本轮被裁掉的对话",
      formatEvictedMessages(input.evictedMessages),
      "",
      "## 本轮被裁掉的工具结果",
      formatEvictedObservations(input),
      "",
      "请输出更新后的完整 rolling summary（incremental merge，不要只写 delta）。",
    ].join("\n");
  }

  return [
    "## User task",
    input.taskText,
    "",
    "## Existing rolling summary",
    previous,
    "",
    "## Evicted conversation",
    formatEvictedMessages(input.evictedMessages),
    "",
    "## Evicted tool results",
    formatEvictedObservations(input),
    "",
    "Produce the updated full rolling summary (incremental merge, not delta-only).",
  ].join("\n");
}

export function buildCompactionMergePrompt(input: CompactionSummarizeInput): {
  system: string;
  user: string;
} {
  const locale = input.locale ?? "en";
  return {
    system: buildSystemPrompt(locale),
    user: buildUserPrompt(input),
  };
}

export function buildCompactionMergeMessages(
  input: CompactionSummarizeInput,
): InternalMessage[] {
  const locale = input.locale ?? "en";
  const prompt = buildCompactionMergePrompt({ ...input, locale });
  const createdAt = new Date().toISOString();
  return [
    {
      id: `compaction_system_${input.compactionIndex}`,
      role: "system",
      content: prompt.system,
      createdAt,
    },
    {
      id: `compaction_user_${input.compactionIndex}`,
      role: "user",
      content: prompt.user,
      createdAt,
    },
  ];
}
