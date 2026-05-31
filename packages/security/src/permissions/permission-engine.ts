import type {
  PermissionDecision,
  PermissionRequest,
  AgentMode,
} from "@code-mind/shared";
import { canReadFile } from "./file-rules.js";
import { getShellPermission } from "./shell-rules.js";
import { getRunSubagentPermission } from "./subagent-permission.js";
import { parsePatch } from "@code-mind/shared";

function getStringArg(
  args: Record<string, unknown>,
  key: string,
): string | null {
  const value = args[key];
  return typeof value === "string" ? value : null;
}

function patchDecision(mode: AgentMode): PermissionDecision {
  switch (mode) {
    case "ask":
      return { type: "deny", reason: "Patch is disabled in ask mode." };
    case "plan":
      return { type: "deny", reason: "Patch is disabled in plan mode." };
    case "edit":
      return { type: "ask", reason: "Patch application requires approval in edit mode." };
    case "agent":
      return { type: "allow" };
  }
}

function isDeniedWritePath(path: string): boolean {
  return (
    path === ".env" ||
    path.startsWith(".env.") ||
    path.startsWith(".git/") ||
    path.startsWith(".github/workflows/") ||
    path.startsWith("secrets/") ||
    path.endsWith(".pem") ||
    path.endsWith(".key")
  );
}

function isAskWritePath(path: string): boolean {
  return (
    path === "package.json" ||
    path === "tsconfig.json" ||
    path === "package-lock.json" ||
    path === "pnpm-lock.yaml" ||
    path === "yarn.lock" ||
    path.endsWith(".config.js") ||
    path.endsWith(".config.ts") ||
    path.startsWith(".github/")
  );
}

function isDefaultAutoEditablePath(path: string): boolean {
  return (
    path.startsWith("src/") ||
    path.startsWith("tests/") ||
    path.startsWith("docs/") ||
    path === "README.md"
  );
}

function getWritePathDecision(
  path: string,
  mode: AgentMode,
): PermissionDecision {
  if (isDeniedWritePath(path)) {
    return { type: "deny", reason: `Write target "${path}" is blocked by file policy.` };
  }

  if (mode === "edit") {
    return { type: "ask", reason: "File write requires approval in edit mode." };
  }

  if (mode === "agent") {
    if (isAskWritePath(path)) {
      return { type: "ask", reason: `Write target "${path}" requires approval in agent mode.` };
    }
    if (isDefaultAutoEditablePath(path)) {
      return { type: "allow" };
    }
    return { type: "ask", reason: `Write target "${path}" is outside the default agent allowlist.` };
  }

  return patchDecision(mode);
}

function getPatchPathDecision(
  path: string,
  mode: AgentMode,
): PermissionDecision {
  if (isDeniedWritePath(path)) {
    return { type: "deny", reason: `Patch target "${path}" is blocked by file policy.` };
  }

  if (mode === "edit") {
    return { type: "ask", reason: "Patch application requires approval in edit mode." };
  }

  if (mode === "agent") {
    if (isAskWritePath(path)) {
      return { type: "ask", reason: `Patch target "${path}" requires approval in agent mode.` };
    }
    if (isDefaultAutoEditablePath(path)) {
      return { type: "allow" };
    }
    return { type: "ask", reason: `Patch target "${path}" is outside the default agent allowlist.` };
  }

  return patchDecision(mode);
}

function getPatchDecision(
  patch: string,
  mode: AgentMode,
): PermissionDecision {
  try {
    const parsed = parsePatch(patch);
    return getPatchPathDecision(parsed.filePath, mode);
  } catch (error) {
    return {
      type: "deny",
      reason:
        error instanceof Error
          ? `Patch is malformed: ${error.message}`
          : "Patch is malformed.",
    };
  }
}

function getMcpPermission(toolName: string): PermissionDecision {
  if (/^mcp__.+__(delete_|drop_|update_|remove_)/.test(toolName)) {
    return { type: "deny", reason: "MCP destructive tool is blocked by policy." };
  }
  if (/^mcp__.+__(create_|click|query)/.test(toolName)) {
    return { type: "ask", reason: "MCP write-like tool requires approval." };
  }
  return { type: "allow" };
}

function matchesPlanDraftPath(planDraftRelativePath: string, candidatePath: string): boolean {
  const normalized = candidatePath.replace(/\\/g, "/");
  const draftNormalized = planDraftRelativePath.replace(/\\/g, "/");
  return (
    normalized === draftNormalized ||
    normalized.endsWith(`/${draftNormalized}`) ||
    normalized.endsWith("/plan-draft.md")
  );
}

function getPlanModeWriteDecision(
  path: string,
  planDraftRelativePath: string,
): PermissionDecision {
  if (matchesPlanDraftPath(planDraftRelativePath, path)) {
    return { type: "allow" };
  }
  return {
    type: "deny",
    reason: `In plan mode, writes are only allowed for the plan draft at "${planDraftRelativePath}".`,
  };
}

function mergeWritePathDecisions(
  decisions: PermissionDecision[],
): PermissionDecision {
  if (decisions.some((decision) => decision.type === "deny")) {
    return (
      decisions.find((decision) => decision.type === "deny") ?? {
        type: "deny",
        reason: "File write is blocked by policy.",
      }
    );
  }
  if (decisions.some((decision) => decision.type === "ask")) {
    return (
      decisions.find((decision) => decision.type === "ask") ?? {
        type: "ask",
        reason: "File write requires approval.",
      }
    );
  }
  return { type: "allow" };
}

function getWritePathPermission(
  path: string,
  mode: AgentMode,
  input: PermissionRequest,
): PermissionDecision {
  if (input.planModeActive && input.planDraftRelativePath) {
    return getPlanModeWriteDecision(path, input.planDraftRelativePath);
  }
  return getWritePathDecision(path, mode);
}

export class PermissionEngine {
  async check(input: PermissionRequest): Promise<PermissionDecision> {
    const { toolCall, mode } = input;

    switch (toolCall.name) {
      case "list_dir":
      case "glob":
      case "grep":
      case "git_status":
      case "git_diff":
      case "git_log":
      case "git_changed_files":
      case "git_show":
      case "lsp_diagnostics":
        return { type: "allow" };
      case "read_file": {
        const path = getStringArg(toolCall.arguments, "path");
        if (path === null) {
          return { type: "deny", reason: "read_file requires a string path argument." };
        }
        return canReadFile(path)
          ? { type: "allow" }
          : { type: "deny", reason: "Access denied for sensitive path." };
      }
      case "apply_patch":
        if (typeof toolCall.arguments.patch !== "string") {
          return { type: "deny", reason: "apply_patch requires a string patch argument." };
        }
        if (input.planModeActive && input.planDraftRelativePath) {
          try {
            const parsed = parsePatch(toolCall.arguments.patch);
            return getPlanModeWriteDecision(parsed.filePath, input.planDraftRelativePath);
          } catch (error) {
            return {
              type: "deny",
              reason:
                error instanceof Error
                  ? `Patch is malformed: ${error.message}`
                  : "Patch is malformed.",
            };
          }
        }
        return getPatchDecision(toolCall.arguments.patch, mode);
      case "write_file": {
        const path = getStringArg(toolCall.arguments, "path");
        if (path === null) {
          return { type: "deny", reason: "write_file requires a string path argument." };
        }
        if (typeof toolCall.arguments.content !== "string") {
          return { type: "deny", reason: "write_file requires a string content argument." };
        }
        if (input.planModeActive && input.planDraftRelativePath) {
          return getPlanModeWriteDecision(path, input.planDraftRelativePath);
        }
        return getWritePathDecision(path, mode);
      }
      case "search_replace": {
        const path = getStringArg(toolCall.arguments, "path");
        if (path === null) {
          return { type: "deny", reason: "search_replace requires a string path argument." };
        }
        if (typeof toolCall.arguments.old_string !== "string") {
          return { type: "deny", reason: "search_replace requires a string old_string argument." };
        }
        if (typeof toolCall.arguments.new_string !== "string") {
          return { type: "deny", reason: "search_replace requires a string new_string argument." };
        }
        if (input.planModeActive && input.planDraftRelativePath) {
          return getPlanModeWriteDecision(path, input.planDraftRelativePath);
        }
        return getWritePathDecision(path, mode);
      }
      case "delete_file": {
        const path = getStringArg(toolCall.arguments, "path");
        if (path === null) {
          return { type: "deny", reason: "delete_file requires a string path argument." };
        }
        if (input.planModeActive) {
          return { type: "deny", reason: "delete_file is disabled in plan mode." };
        }
        return getWritePathPermission(path, mode, input);
      }
      case "move_file": {
        const from = getStringArg(toolCall.arguments, "from");
        const to = getStringArg(toolCall.arguments, "to");
        if (from === null) {
          return { type: "deny", reason: "move_file requires a string from argument." };
        }
        if (to === null) {
          return { type: "deny", reason: "move_file requires a string to argument." };
        }
        if (input.planModeActive) {
          return { type: "deny", reason: "move_file is disabled in plan mode." };
        }
        return mergeWritePathDecisions([
          getWritePathPermission(from, mode, input),
          getWritePathPermission(to, mode, input),
        ]);
      }
      case "run_shell": {
        const command = getStringArg(toolCall.arguments, "command");
        if (command === null) {
          return { type: "deny", reason: "run_shell requires a string command argument." };
        }
        if (mode === "plan") {
          return /--dry-run|--no-emit|--noEmit/i.test(command)
            ? { type: "allow" }
            : { type: "deny", reason: "Shell execution is restricted in plan mode." };
        }

        switch (getShellPermission(command, mode)) {
          case "allow":
            return { type: "allow" };
          case "deny":
            return {
              type: "deny",
              reason:
                mode === "ask"
                  ? "Command is blocked in ask mode."
                  : "Command is blocked by shell policy.",
            };
          case "ask":
            return { type: "ask", reason: "Command requires approval." };
        }
      }
      case "git_restore_file":
      case "worktree_create":
      case "worktree_cleanup":
        return { type: "ask", reason: `Tool ${toolCall.name} requires approval.` };
      case "worktree_status":
      case "worktree_diff":
        return { type: "allow" };
      case "enter_plan_mode":
      case "exit_plan_mode":
        return { type: "allow" };
      case "run_subagent": {
        const agentName =
          typeof toolCall.arguments.agentName === "string"
            ? toolCall.arguments.agentName
            : "";
        return getRunSubagentPermission({
          mode,
          ...(input.planModeActive === undefined ? {} : { planModeActive: input.planModeActive }),
          ...(input.isSubagentSession === undefined
            ? {}
            : { isSubagentSession: input.isSubagentSession }),
          agentName,
          ...(input.subagentTools === undefined ? {} : { subagentTools: input.subagentTools }),
          ...(input.subagentRole === undefined ? {} : { subagentRole: input.subagentRole }),
          ...(input.subagentKnown === undefined ? {} : { subagentKnown: input.subagentKnown }),
        });
      }
      default:
        if (toolCall.name.startsWith("mcp__")) {
          return getMcpPermission(toolCall.name);
        }
        return { type: "ask", reason: `Unknown tool "${toolCall.name}" requires approval.` };
    }
  }
}
