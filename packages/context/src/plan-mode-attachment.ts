import type { AgentSession } from "@code-mind/shared";

export function buildPlanModeAttachment(session: AgentSession): string | null {
  if (session.metadata?.planModeActive !== true) {
    return null;
  }
  const draftPath =
    typeof session.metadata.planDraftPath === "string"
      ? session.metadata.planDraftPath
      : "plan-draft.md in the session directory";

  return [
    "Plan mode workflow:",
    "- You are in read-only plan mode. Do not modify source files.",
    `- Write the plan only to: ${draftPath}`,
    "- Prefer read/search yourself for simple scope; use run_subagent(explore) only for broad cross-module research with a specific sub-question.",
    "- You write plan-draft and call exit_plan_mode; do not spawn plan sub-agents to bypass user approval.",
    "- Then call exit_plan_mode with the final plan text for user approval.",
    "- After approval you will return to the prior collaboration mode.",
  ].join("\n");
}
