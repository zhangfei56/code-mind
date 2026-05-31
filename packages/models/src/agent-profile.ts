import type { AgentProfile } from "@code-mind/shared";
import { resolveModelPromptKey } from "./model-prompt.js";
import { getProductPrompt, resolveProductPromptLocale } from "./product-prompt.js";

export interface DefaultAgentProfileOptions {
  repoRootFocus?: boolean;
  providerModel?: string;
}

function buildBaseSystemPrompt(
  modelName?: string,
  options: DefaultAgentProfileOptions = {},
): string {
  const locale = resolveProductPromptLocale(modelName, options.providerModel);
  const lines = [getProductPrompt("agent-base", locale)];

  if (options.repoRootFocus) {
    lines.push(getProductPrompt("agent-repo-root", locale));
  }

  return lines.join("\n\n");
}

/** Shared default profile for CLI/API; model-specific text is injected by context. */
export function createDefaultAgentProfile(
  modelName?: string,
  options: DefaultAgentProfileOptions = {},
): AgentProfile {
  return {
    id: options.repoRootFocus ? "repo-root-code-agent" : "default-code-agent",
    name: options.repoRootFocus ? "Repo Root Code Agent" : "Default Code Agent",
    systemPrompt: buildBaseSystemPrompt(modelName, options),
    metadata: {
      promptFamily: resolveModelPromptKey(modelName, options.providerModel),
      promptLocale: resolveProductPromptLocale(modelName, options.providerModel),
      ...(options.providerModel ? { providerModel: options.providerModel } : {}),
      ...(options.repoRootFocus ? { repoRootFocus: true } : {}),
    },
  };
}
