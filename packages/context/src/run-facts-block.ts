import type { AgentSession } from "@code-mind/shared";

export function buildRunFactsBlock(session: AgentSession): string {
  const mode =
    typeof session.metadata?.mode === "string" ? session.metadata.mode : session.task.mode;
  const atWorkspaceRoot = session.task.cwd === session.workspaceRoot;

  const lines = ["Run context:", `- Mode: ${mode}`];

  if (mode === "ask") {
    lines.push("- Do not modify files. Answer from inspected evidence.");
  } else if (mode === "plan") {
    lines.push("- Do not modify source files. Produce an executable plan from inspected evidence.");
  } else {
    lines.push("- When code was modified, prefer verification before declaring success.");
  }

  if (atWorkspaceRoot) {
    lines.push(
      "- Operating from repository root: narrow scope after initial exploration instead of broad sweeps.",
    );
  }

  return lines.join("\n");
}
