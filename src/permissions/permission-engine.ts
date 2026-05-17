import type {
  PermissionDecision,
  PermissionRequest,
  RunMode,
} from "../shared/types.js";
import { canReadFile } from "./file-rules.js";
import { getShellPermission } from "./shell-rules.js";

function getStringArg(
  args: Record<string, unknown>,
  key: string,
): string | null {
  const value = args[key];
  return typeof value === "string" ? value : null;
}

function patchDecision(mode: RunMode): PermissionDecision {
  switch (mode) {
    case "read_only":
      return { type: "deny", reason: "Patch is disabled in read_only mode." };
    case "suggest":
      return { type: "ask", reason: "Patch application requires approval in suggest mode." };
    case "auto_edit":
    case "full_auto":
    case "sandbox_auto":
      return { type: "allow" };
  }
}

export class PermissionEngine {
  async check(input: PermissionRequest): Promise<PermissionDecision> {
    const { toolCall, mode } = input;

    switch (toolCall.name) {
      case "list_dir":
      case "grep":
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
        return patchDecision(mode);
      case "run_shell": {
        if (mode === "read_only") {
          return { type: "deny", reason: "Shell execution is disabled in read_only mode." };
        }

        const command = getStringArg(toolCall.arguments, "command");
        if (command === null) {
          return { type: "deny", reason: "run_shell requires a string command argument." };
        }

        switch (getShellPermission(command)) {
          case "allow":
            return { type: "allow" };
          case "deny":
            return { type: "deny", reason: "Command is blocked by shell policy." };
          case "ask":
            return { type: "ask", reason: "Command requires approval." };
        }
      }
      default:
        return { type: "ask", reason: `Unknown tool "${toolCall.name}" requires approval.` };
    }
  }
}
