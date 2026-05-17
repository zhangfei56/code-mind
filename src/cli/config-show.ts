import type { AgentConfig } from "../config/schema.js";

export function renderConfig(config: AgentConfig): string {
  return JSON.stringify(config, null, 2);
}
