import type { AgentMode, PermissionDecision } from "@code-mind/shared";

export const SUBAGENT_WRITE_TOOLS = new Set([
  "apply_patch",
  "write_file",
  "search_replace",
  "delete_file",
  "move_file",
  "run_shell",
  "git_restore_file",
  "worktree_create",
  "worktree_cleanup",
  "run_subagent",
]);

export const BUILTIN_READ_ONLY_SUBAGENTS = new Set(["explore", "plan"]);

export function subagentToolsIncludeWrite(tools: readonly string[]): boolean {
  return tools.some((name) => SUBAGENT_WRITE_TOOLS.has(name));
}

export function isBuiltinReadOnlySubagent(
  agentName: string,
  role?: "explore" | "plan" | "general",
): boolean {
  if (BUILTIN_READ_ONLY_SUBAGENTS.has(agentName)) {
    return true;
  }
  return role === "explore" || role === "plan";
}

export function getRunSubagentPermission(input: {
  mode: AgentMode;
  planModeActive?: boolean;
  isSubagentSession?: boolean;
  agentName: string;
  subagentTools?: string[];
  subagentRole?: "explore" | "plan" | "general";
  /** False when SubagentManager resolved the name and found no definition. */
  subagentKnown?: boolean;
}): PermissionDecision {
  if (input.isSubagentSession) {
    return { type: "deny", reason: "Sub-agents cannot spawn nested sub-agents." };
  }

  const agentName = input.agentName.trim();
  if (!agentName) {
    return { type: "deny", reason: "run_subagent requires a non-empty agentName." };
  }

  if (input.subagentKnown === false) {
    return {
      type: "deny",
      reason: `Unknown sub-agent "${agentName}". Use explore, plan, or a custom agent from .agent/agents.`,
    };
  }

  const tools = input.subagentTools ?? [];

  if (tools.length > 0) {
    if (!subagentToolsIncludeWrite(tools)) {
      return { type: "allow" };
    }
    if (input.planModeActive || input.mode === "plan") {
      return {
        type: "deny",
        reason: `Sub-agent "${agentName}" cannot run write tools in plan mode.`,
      };
    }
    return {
      type: "ask",
      reason: `Sub-agent "${agentName}" includes write tools and requires approval.`,
    };
  }

  if (isBuiltinReadOnlySubagent(agentName, input.subagentRole)) {
    return { type: "allow" };
  }

  return {
    type: "ask",
    reason: `Sub-agent "${agentName}" delegation requires approval.`,
  };
}
