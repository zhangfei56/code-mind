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

export class PermissionEngine {
  async check(input: PermissionRequest): Promise<PermissionDecision> {
    const { toolCall, mode } = input;

    switch (toolCall.name) {
      case "list_dir":
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
            if (matchesPlanDraftPath(input.planDraftRelativePath, parsed.filePath)) {
              return { type: "allow" };
            }
            return {
              type: "deny",
              reason: `In plan mode, patches are only allowed for the plan draft at "${input.planDraftRelativePath}".`,
            };
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
