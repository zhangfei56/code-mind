import type {
  PermissionDecision,
  SafetyCheckInput,
} from "@code-mind/shared";

const LARGE_DELETION_THRESHOLD = 100;
const UPLOAD_COMMAND_PATTERNS = [
  /\bcurl\b.*\b(pastebin\.com|gist\.github\.com|webhook\.site)\b/i,
  /\bwget\b.*\b(pastebin\.com|gist\.github\.com|webhook\.site)\b/i,
  /\bscp\b/i,
  /\brsync\b.*:/i,
] as const;

function countDeletedLines(patch: string): number {
  return patch
    .split("\n")
    .filter((line) => line.startsWith("-") && !line.startsWith("---"))
    .length;
}

export class SafetyGuard {
  async check(input: SafetyCheckInput): Promise<PermissionDecision> {
    const { toolCall } = input;

    if (
      toolCall.name === "apply_patch" &&
      typeof toolCall.arguments.patch === "string"
    ) {
      const deletedLines = countDeletedLines(toolCall.arguments.patch);
      if (deletedLines >= LARGE_DELETION_THRESHOLD) {
        return {
          type: "ask",
          reason: `Patch deletes ${deletedLines} lines and requires approval.`,
        };
      }
    }

    if (
      toolCall.name === "search_replace" &&
      typeof toolCall.arguments.old_string === "string" &&
      typeof toolCall.arguments.new_string === "string"
    ) {
      const oldLines = toolCall.arguments.old_string.split("\n").length;
      const newLines = toolCall.arguments.new_string.split("\n").length;
      const deletedLines = Math.max(0, oldLines - newLines);
      if (deletedLines >= LARGE_DELETION_THRESHOLD) {
        return {
          type: "ask",
          reason: `search_replace removes ${deletedLines} lines and requires approval.`,
        };
      }
    }

    if (
      toolCall.name === "run_shell" &&
      typeof toolCall.arguments.command === "string"
    ) {
      const normalized = toolCall.arguments.command.trim();
      if (UPLOAD_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized))) {
        return {
          type: "deny",
          reason: "Command looks like code upload or external exfiltration.",
        };
      }
    }

    return { type: "allow" };
  }
}
