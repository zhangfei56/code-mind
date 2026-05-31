import { resolveProductPromptLocale } from "@code-mind/models";
import type { AgentSession } from "@code-mind/shared";

export function resolveCompactionLocale(session: AgentSession): "zh" | "en" {
  const stored = session.profile.metadata?.promptLocale;
  if (stored === "zh" || stored === "en") {
    return stored;
  }
  const providerModel =
    typeof session.profile.metadata?.providerModel === "string"
      ? session.profile.metadata.providerModel
      : undefined;
  return resolveProductPromptLocale(session.modelName, providerModel);
}
