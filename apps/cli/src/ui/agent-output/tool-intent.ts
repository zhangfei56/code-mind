import type { ToolCall } from "@code-mind/shared";
import { shortPath } from "../theme.js";

function readStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value : "";
}

/** Human-readable rationale for a planned or running tool call. */
export function describeToolIntent(toolCall: ToolCall): string {
  const args = (toolCall.arguments ?? {}) as Record<string, unknown>;

  switch (toolCall.name) {
    case "read_file": {
      const path = readStringArg(args, "path");
      const short = shortPath(path || "unknown");
      if (/README/i.test(path)) {
        return `Read project overview (${short}) to learn layout and entry points`;
      }
      if (/packages\.md/i.test(path)) {
        return `Read package map (${short}) to see what is built vs planned`;
      }
      if (/principles\.md/i.test(path) || /data-model\.md/i.test(path)) {
        return `Read architecture notes (${short}) before tracing code paths`;
      }
      if (/user-guide\.md/i.test(path)) {
        return `Read CLI usage (${short}) for runtime behavior`;
      }
      if (/^docs\//i.test(path)) {
        return `Read project doc ${short} for context`;
      }
      if (/\.(test|spec)\./i.test(path) || /\/tests?\//i.test(path)) {
        return `Inspect test file ${short} for expected behavior`;
      }
      return `Read ${short} to gather evidence before changing code`;
    }
    case "list_dir": {
      const path = readStringArg(args, "path") || ".";
      return `List ${shortPath(path)} to locate README, src, tests, and packages`;
    }
    case "grep": {
      const pattern = readStringArg(args, "pattern");
      return pattern
        ? `Search codebase for "${pattern}" to narrow suspect files`
        : "Search codebase for relevant symbols or strings";
    }
    case "run_shell": {
      const command = readStringArg(args, "command");
      if (/pnpm test|npm test|yarn test|vitest|jest/i.test(command)) {
        return "Run tests to surface failing cases and error output";
      }
      if (/git status/i.test(command)) {
        return "Check git status for local changes before debugging";
      }
      if (/git diff/i.test(command)) {
        return "Inspect diffs for recent changes related to the issue";
      }
      if (/pnpm build|npm run build|tsc/i.test(command)) {
        return "Run build/typecheck to catch compile errors";
      }
      const preview = command.length > 72 ? `${command.slice(0, 69)}…` : command;
      return `Run shell command: ${preview}`;
    }
    case "git_status":
      return "Inspect repository status for uncommitted changes";
    case "git_diff":
      return "Review diffs to see what changed recently";
    case "run_subagent": {
      const agent = readStringArg(args, "agentName") || "subagent";
      const task = readStringArg(args, "task");
      return task
        ? `Delegate to ${agent}: ${task.length > 80 ? `${task.slice(0, 77)}…` : task}`
        : `Delegate read-only research to ${agent}`;
    }
    case "apply_patch":
      return "Apply a focused code change after inspecting the target file";
    case "enter_plan_mode":
      return "Switch to read-only plan mode before risky edits";
    default:
      return `Run ${toolCall.name}`;
  }
}
