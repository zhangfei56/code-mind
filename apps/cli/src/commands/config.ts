import type { AgentConfig } from "@code-mind/config";

export function renderConfig(config: AgentConfig): string {
  return JSON.stringify(config, null, 2);
}
