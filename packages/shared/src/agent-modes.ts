export type AgentMode = "ask" | "plan" | "edit" | "agent";

export const AGENT_MODES: readonly AgentMode[] = ["ask", "plan", "edit", "agent"];

export const DEFAULT_AGENT_MODE: AgentMode = "edit";

/** Read-only inspection tools available in every mode. */
export const READ_TOOLS_MODES: AgentMode[] = ["ask", "plan", "edit", "agent"];

/** Planning helpers beyond pure read tools. */
export const PLAN_TOOLS_MODES: AgentMode[] = ["plan", "edit", "agent"];

/** Tools that can modify workspace state or run non-read-only commands. */
export const WRITE_TOOLS_MODES: AgentMode[] = ["edit", "agent"];
