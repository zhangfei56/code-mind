import type { RunFactsSnapshot } from "@code-mind/shared";
import type { AgentSession } from "@code-mind/shared";
import { getProductPrompt, type ProductPromptLocale } from "@code-mind/models";

function resolveMode(session: AgentSession, runFacts?: RunFactsSnapshot): string {
  if (runFacts?.mode) {
    return runFacts.mode;
  }
  if (typeof session.metadata?.mode === "string") {
    return session.metadata.mode;
  }
  return session.task.mode;
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
    modeExecutionHint: buildModeExecutionHint(mode, options.locale),
    repoRootHint: buildRepoRootHint(session, options.runFacts, options.locale),
  });
}
