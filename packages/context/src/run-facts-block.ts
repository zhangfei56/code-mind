import type { RunFactsSnapshot } from "@code-mind/shared";
import type { AgentSession } from "@code-mind/shared";
import { getProductPrompt, type ProductPromptLocale } from "@code-mind/models";

function activityLabelLocalized(
  kind: NonNullable<RunFactsSnapshot["lastActivity"]>,
  locale: ProductPromptLocale,
): string {
  const zh: Record<string, string> = {
    thinking: "思考",
    reading: "阅读",
    searching: "搜索",
    editing: "编辑",
    running: "运行命令",
    verifying: "验证",
    approving: "等待审批",
    delegating: "委派子任务",
    summarizing: "总结",
  };
  const en: Record<string, string> = {
    thinking: "Thinking",
    reading: "Reading",
    searching: "Searching",
    editing: "Editing",
    running: "Running",
    verifying: "Validating",
    approving: "Approving",
    delegating: "Delegating",
    summarizing: "Summarizing",
  };
  return (locale === "zh" ? zh : en)[kind] ?? kind;
}

function resolveMode(session: AgentSession, runFacts?: RunFactsSnapshot): string {
  if (runFacts?.mode) {
    return runFacts.mode;
  }
  if (typeof session.metadata?.mode === "string") {
    return session.metadata.mode;
  }
  return session.task.mode;
}

function buildStepLine(runFacts: RunFactsSnapshot | undefined, locale: ProductPromptLocale): string {
  if (!runFacts || runFacts.step <= 0) {
    return "";
  }
  const maxSteps =
    typeof runFacts.maxSteps === "number" && runFacts.maxSteps > 0
      ? ` / ${runFacts.maxSteps}`
      : "";
  return locale === "zh"
    ? `- 步骤：${runFacts.step}${maxSteps}\n`
    : `- Step: ${runFacts.step}${maxSteps}\n`;
}

function buildModeExecutionHint(mode: string, locale: ProductPromptLocale): string {
  if (mode === "ask") {
    return locale === "zh"
      ? "- 不要修改文件。基于已检查证据回答。\n"
      : "- Do not modify files. Answer from inspected evidence.\n";
  }
  if (mode === "plan") {
    return locale === "zh"
      ? "- 不要修改源码。基于已检查证据产出可执行计划。\n"
      : "- Do not modify source files. Produce an executable plan from inspected evidence.\n";
  }
  return locale === "zh"
    ? "- 若已修改代码，在宣告成功前先验证。\n"
    : "- When code was modified, prefer verification before declaring success.\n";
}

function buildRepoRootHint(
  session: AgentSession,
  runFacts: RunFactsSnapshot | undefined,
  locale: ProductPromptLocale,
): string {
  const atRoot =
    runFacts?.atWorkspaceRoot ?? session.task.cwd === session.workspaceRoot;
  if (!atRoot) {
    return "";
  }
  return locale === "zh"
    ? "- 当前在仓库根目录：初步探索后应收窄范围，避免横向扫描全库。\n"
    : "- Operating from repository root: narrow scope after initial exploration instead of broad sweeps.\n";
}

function buildProgressSection(
  runFacts: RunFactsSnapshot | undefined,
  locale: ProductPromptLocale,
): string {
  if (!runFacts) {
    return "";
  }

  const lines: string[] = [];

  if (runFacts.closingTurn) {
    lines.push(
      locale === "zh"
        ? "- 已进入收尾轮：优先总结，避免继续 broad 探索。"
        : "- Closing turn active: summarize findings; avoid broad exploration.",
    );
  }

  if (runFacts.planModeActive) {
    lines.push(
      locale === "zh"
        ? "- Plan 模式进行中：只写计划，不改源码。"
        : "- Plan mode active: write the plan only; do not edit source files.",
    );
  }

  if (runFacts.lastActivity) {
    lines.push(
      locale === "zh"
        ? `- 最近活动：${activityLabelLocalized(runFacts.lastActivity, locale)}。`
        : `- Last activity: ${activityLabelLocalized(runFacts.lastActivity, locale)}.`,
    );
  }

  if (runFacts.lastTool?.name) {
    lines.push(
      locale === "zh"
        ? `- 最近工具：${runFacts.lastTool.name}（${runFacts.lastTool.at}）。`
        : `- Last tool: ${runFacts.lastTool.name} (${runFacts.lastTool.at}).`,
    );
  }

  if (runFacts.toolCounts) {
    const { read, search, edit, shell } = runFacts.toolCounts;
    if (read + search + edit + shell > 0) {
      lines.push(
        locale === "zh"
          ? `- 工具计数：read ${read}，search ${search}，edit ${edit}，shell ${shell}。`
          : `- Tool counts: read ${read}, search ${search}, edit ${edit}, shell ${shell}.`,
      );
    }
  }

  if (runFacts.modifiedFiles.length > 0) {
    lines.push(
      locale === "zh"
        ? `- 已修改文件：${runFacts.modifiedFiles.join(", ")}。`
        : `- Modified files: ${runFacts.modifiedFiles.join(", ")}.`,
    );
  }

  if (runFacts.lastVerification) {
    const { passed, summary } = runFacts.lastVerification;
    lines.push(
      passed
        ? locale === "zh"
          ? `- 最近验证：通过。${summary}`
          : `- Last verification: passed. ${summary}`
        : locale === "zh"
          ? `- 最近验证：失败。${summary}`
          : `- Last verification: failed. ${summary}`,
    );
  }

  if (lines.length === 0) {
    return "";
  }

  return `${lines.join("\n")}\n`;
}

export function buildRunFactsBlock(
  session: AgentSession,
  options: {
    locale: ProductPromptLocale;
    runFacts?: RunFactsSnapshot;
  },
): string {
  const mode = resolveMode(session, options.runFacts);

  return getProductPrompt("run-facts", options.locale, {
    mode,
    stepLine: buildStepLine(options.runFacts, options.locale),
    modeExecutionHint: buildModeExecutionHint(mode, options.locale),
    repoRootHint: buildRepoRootHint(session, options.runFacts, options.locale),
    progressSection: buildProgressSection(options.runFacts, options.locale),
  });
}
