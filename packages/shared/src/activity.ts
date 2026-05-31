import type { ToolCall } from "./types.js";

export type ActivityKind =
  | "thinking"
  | "reading"
  | "searching"
  | "editing"
  | "running"
  | "verifying"
  | "approving"
  | "delegating"
  | "summarizing";

export interface ToolActivityCounts {
  read: number;
  search: number;
  edit: number;
  shell: number;
}

export function createEmptyToolActivityCounts(): ToolActivityCounts {
  return { read: 0, search: 0, edit: 0, shell: 0 };
}

const READ_TOOLS = new Set(["read_file", "list_dir"]);
const SEARCH_TOOLS = new Set(["glob", "grep"]);
const EDIT_TOOLS = new Set([
  "apply_patch",
  "write_file",
  "search_replace",
  "delete_file",
  "move_file",
]);
const SHELL_TOOLS = new Set(["run_shell"]);

export function deriveActivityFromTool(toolCall: ToolCall): ActivityKind {
  if (toolCall.name === "run_subagent") {
    return "delegating";
  }
  if (READ_TOOLS.has(toolCall.name)) {
    return "reading";
  }
  if (SEARCH_TOOLS.has(toolCall.name)) {
    return "searching";
  }
  if (EDIT_TOOLS.has(toolCall.name)) {
    return "editing";
  }
  if (SHELL_TOOLS.has(toolCall.name)) {
    return "running";
  }
  return "running";
}

export function toolActivityBucket(toolName: string): keyof ToolActivityCounts | undefined {
  if (READ_TOOLS.has(toolName)) {
    return "read";
  }
  if (SEARCH_TOOLS.has(toolName)) {
    return "search";
  }
  if (EDIT_TOOLS.has(toolName)) {
    return "edit";
  }
  if (SHELL_TOOLS.has(toolName)) {
    return "shell";
  }
  return undefined;
}

export function activityLabel(kind: ActivityKind): string {
  switch (kind) {
    case "thinking":
      return "Thinking";
    case "reading":
      return "Reading";
    case "searching":
      return "Searching";
    case "editing":
      return "Editing";
    case "running":
      return "Running";
    case "verifying":
      return "Validating";
    case "approving":
      return "Approving";
    case "delegating":
      return "Delegating";
    case "summarizing":
      return "Summarizing";
    default:
      return kind;
  }
}

export function activityDetailFromTool(toolCall: ToolCall): string | undefined {
  const args = toolCall.arguments ?? {};
  if (toolCall.name === "run_subagent") {
    const agentName = typeof args.agentName === "string" ? args.agentName : "subagent";
    const task = typeof args.task === "string" ? args.task.trim() : "";
    if (task.length > 0) {
      const preview = task.length > 80 ? `${task.slice(0, 77)}...` : task;
      return `${agentName} · ${preview}`;
    }
    return agentName;
  }
  if (typeof args.path === "string") {
    return args.path;
  }
  if (toolCall.name === "move_file") {
    const from = typeof args.from === "string" ? args.from : "";
    const to = typeof args.to === "string" ? args.to : "";
    if (from && to) {
      return `${from} → ${to}`;
    }
  }
  if (typeof args.pattern === "string") {
    return args.pattern;
  }
  if (typeof args.command === "string") {
    return args.command.split("\n")[0]?.slice(0, 80);
  }
  return undefined;
}
