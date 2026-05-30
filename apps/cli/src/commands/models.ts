import { loadConfig } from "@code-mind/config";
import type { AgentConfig } from "@code-mind/config";

export function renderModelsList(config: AgentConfig, provider?: string): string {
  const entries = Object.entries(config.models).filter(([name, model]) => {
    if (provider === undefined) {
      return true;
    }
    return name === provider || model.provider === provider;
  });

  if (entries.length === 0) {
    return provider === undefined
      ? "No models configured."
      : `No models found for provider: ${provider}`;
  }

  return entries
    .map(([name, model]) => {
      const defaultTag = name === config.defaultModel ? " (default)" : "";
      return `${name}${defaultTag}\t${model.provider}\t${model.model}\t${model.baseUrl}`;
    })
    .join("\n");
}

export function renderProvidersList(config: AgentConfig): string {
  const providers = new Map<string, { models: string[]; baseUrl: string }>();

  for (const [name, model] of Object.entries(config.models)) {
    const key = model.provider;
    const current = providers.get(key) ?? { models: [], baseUrl: model.baseUrl };
    current.models.push(name);
    providers.set(key, current);
  }

  if (providers.size === 0) {
    return "No providers configured.";
  }

  return [...providers.entries()]
    .map(([provider, info]) => {
      return [
        provider,
        `  base_url: ${info.baseUrl}`,
        `  models: ${info.models.join(", ")}`,
      ].join("\n");
    })
    .join("\n\n");
}

export function renderConfigPaths(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "~";
  return [
    `config: ${home}/.agent/config.yaml`,
    `default_model: see config file or DEEPSEEK_API_KEY / QWEN_API_KEY env`,
  ].join("\n");
}

export function getLoadedConfig(): AgentConfig {
  return loadConfig();
}
