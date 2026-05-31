import { getProductPrompt, resolveProductPromptLocale } from "@code-mind/models";
import type { AgentMode, AgentProfile } from "@code-mind/shared";

function resolveProfileLocale(
  profile: AgentProfile,
  modelName: string,
): ReturnType<typeof resolveProductPromptLocale> {
  const stored = profile.metadata?.promptLocale;
  if (stored === "zh" || stored === "en") {
    return stored;
  }
  const providerModel =
    typeof profile.metadata?.providerModel === "string"
      ? profile.metadata.providerModel
      : undefined;
  return resolveProductPromptLocale(modelName, providerModel);
}

/** System attachment for main sessions: when to delegate vs stay in main loop. */
export function buildSubagentDelegationBlock(
  mode: AgentMode,
  isSubagentSession: boolean,
  profile: AgentProfile,
  modelName: string,
): string | null {
  if (isSubagentSession) {
    return null;
  }

  const locale = resolveProfileLocale(profile, modelName);

  if (mode === "ask") {
    return getProductPrompt("subagent-ask", locale);
  }

  return getProductPrompt("subagent-main", locale);
}
