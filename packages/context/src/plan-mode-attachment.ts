import { getProductPrompt, resolveProductPromptLocale } from "@code-mind/models";
import type { AgentSession } from "@code-mind/shared";

export function buildPlanModeAttachment(session: AgentSession): string | null {
  if (session.metadata?.planModeActive !== true) {
    return null;
  }
  const draftPath =
    typeof session.metadata.planDraftPath === "string"
      ? session.metadata.planDraftPath
      : "plan-draft.md in the session directory";

  const locale = resolveProductPromptLocale(
    session.modelName,
    typeof session.profile.metadata?.providerModel === "string"
      ? session.profile.metadata.providerModel
      : undefined,
  );

  return getProductPrompt("plan-mode", locale, { planDraftPath: draftPath });
}
