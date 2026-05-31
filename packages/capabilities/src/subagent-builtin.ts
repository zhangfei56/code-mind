import type { SubagentDefinition } from "@code-mind/shared";

/** Read-only tools shared by explore/plan typed sub-agents. */
export const READ_ONLY_SUBAGENT_TOOLS = [
  "read_file",
  "list_dir",
  "glob",
  "grep",
  "git_status",
  "git_diff",
  "git_log",
  "git_changed_files",
  "git_show",
  "lsp_diagnostics",
  "worktree_status",
  "worktree_diff",
] as const;

export const BUILTIN_SUBAGENT_DEFINITIONS: SubagentDefinition[] = [
  {
    name: "explore",
    role: "explore",
    description:
      "Read-only codebase explorer. Use for fast, focused research without modifying files.",
    mode: "ask",
    tools: [...READ_ONLY_SUBAGENT_TOOLS],
  },
  {
    name: "plan",
    role: "plan",
    description:
      "Read-only planning architect. Use to design implementation approaches from inspected code.",
    mode: "plan",
    tools: [...READ_ONLY_SUBAGENT_TOOLS],
  },
];

export function getBuiltinSubagent(name: string): SubagentDefinition | undefined {
  return BUILTIN_SUBAGENT_DEFINITIONS.find((agent) => agent.name === name);
}

export function mergeSubagentDefinitions(
  workspaceAgents: SubagentDefinition[],
): SubagentDefinition[] {
  const byName = new Map<string, SubagentDefinition>();
  for (const agent of BUILTIN_SUBAGENT_DEFINITIONS) {
    byName.set(agent.name, agent);
  }
  for (const agent of workspaceAgents) {
    byName.set(agent.name, agent);
  }
  return [...byName.values()];
}

export function roleSystemPrompt(role: SubagentDefinition["role"]): string {
  if (role === "explore") {
    return [
      "You are an Explore sub-agent.",
      "Read and search the codebase only. Do not modify files or run mutating shell commands.",
      "Return concise findings with file paths and the most relevant evidence.",
      "Format: ## Findings, ## Evidence, ## Recommendation, ## Gaps (or None).",
    ].join(" ");
  }
  if (role === "plan") {
    return [
      "You are a Plan sub-agent.",
      "Inspect the codebase read-only and return a step-by-step implementation plan.",
      "Identify critical files, risks, and verification steps. Do not modify source files.",
      "Format: ## Findings, ## Evidence, ## Recommendation, ## Gaps (or None).",
    ].join(" ");
  }
  return "";
}
