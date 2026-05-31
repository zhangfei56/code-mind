import type { ToolCall } from "@code-mind/shared";
import { parsePatch } from "@code-mind/shared";
import { formatDuration } from "../format.js";
import { shortPath } from "../theme.js";
import { toolPayloadToFinishedLike, type ToolFinishedLike } from "./tool-blocks.js";

export type ToolCallLineStatus = "pending" | "done" | "failed";

export interface ToolCallLineMeta {
  durationMs?: number;
  exitCode?: number;
  error?: string;
  filePath?: string;
}

function toolArgs(toolCall: ToolCall): Record<string, unknown> {
  return (toolCall.arguments ?? {}) as Record<string, unknown>;
}

function readStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value : "";
}

function resolvePatchPath(patch: unknown): string | undefined {
  if (typeof patch !== "string") {
    return undefined;
  }
  try {
    return parsePatch(patch).filePath;
  } catch {
    return undefined;
  }
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}

function formatArgPairs(args: Record<string, unknown>, keys: string[]): string {
  const parts: string[] = [];
  for (const key of keys) {
    const value = args[key];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (typeof value === "string") {
      parts.push(`${key}=${value.includes(" ") ? `"${value}"` : value}`);
    } else {
      parts.push(`${key}=${String(value)}`);
    }
  }
  return parts.length > 0 ? `  ${parts.join("  ")}` : "";
}

/** Human-readable argument segment for a tool (no status suffix). */
export function formatToolCallArgs(toolCall: ToolCall, meta: ToolCallLineMeta = {}): string {
  const args = toolArgs(toolCall);
  const name = toolCall.name.padEnd(11);

  switch (toolCall.name) {
    case "list_dir": {
      const path = readStringArg(args, "path") || ".";
      return `${name} ${shortPath(path)}`;
    }
    case "read_file": {
      const path = readStringArg(args, "path") || "unknown";
      return `${name} ${shortPath(path)}`;
    }
    case "grep": {
      const pattern = readStringArg(args, "pattern");
      const extras = formatArgPairs(args, ["path", "glob"]);
      return `${name} "${truncate(pattern, 48)}"${extras}`;
    }
    case "glob": {
      const pattern = readStringArg(args, "pattern");
      const extras = formatArgPairs(args, ["path"]);
      return `${name} "${truncate(pattern, 48)}"${extras}`;
    }
    case "run_shell": {
      const command = readStringArg(args, "command") || toolCall.name;
      return `${name} ${truncate(command, 64)}`;
    }
    case "apply_patch": {
      const path =
        meta.filePath ??
        resolvePatchPath(args.patch) ??
        "unknown file";
      return `${name} ${shortPath(path)}`;
    }
    case "write_file": {
      const path = meta.filePath ?? (readStringArg(args, "path") || "unknown file");
      return `${name} ${shortPath(path)}`;
    }
    case "search_replace": {
      const path = meta.filePath ?? (readStringArg(args, "path") || "unknown file");
      return `${name} ${shortPath(path)}`;
    }
    case "delete_file": {
      const path = meta.filePath ?? (readStringArg(args, "path") || "unknown file");
      return `${name} ${shortPath(path)}`;
    }
    case "move_file": {
      const from = readStringArg(args, "from") || "unknown";
      const to = meta.filePath ?? (readStringArg(args, "to") || "unknown");
      return `${name} ${shortPath(from)} → ${shortPath(to)}`;
    }
    case "run_subagent": {
      const agent = readStringArg(args, "agentName") || "subagent";
      const task = readStringArg(args, "task");
      const taskPart = task ? `  "${truncate(task, 56)}"` : "";
      return `${name} ${agent}${taskPart}`;
    }
    case "git_status":
      return `${name} ${shortPath(readStringArg(args, "path") || ".")}`;
    case "git_diff": {
      const extras = formatArgPairs(args, ["path", "staged"]);
      return `${name}${extras || "  workspace"}`;
    }
    case "lsp_diagnostics":
      return `${name}`;
    default: {
      if (toolCall.name.startsWith("mcp_")) {
        const server = readStringArg(args, "server") || "unknown";
        const tool = readStringArg(args, "tool") || toolCall.name.replace(/^mcp_/, "");
        return `${name} ${server}/${tool}`;
      }
      const summary = Object.entries(args)
        .slice(0, 3)
        .map(([key, value]) => `${key}=${truncate(String(value), 24)}`)
        .join("  ");
      return summary ? `${name} ${summary}` : name.trimEnd();
    }
  }
}

function formatStatusSuffix(
  status: ToolCallLineStatus,
  meta: ToolCallLineMeta,
): string {
  if (status === "pending") {
    return "  …";
  }
  if (status === "failed") {
    const parts = ["  ×"];
    if (meta.exitCode !== undefined) {
      parts.push(`exit ${meta.exitCode}`);
    } else if (meta.error) {
      parts.push(truncate(meta.error, 40));
    }
    return parts.join(" ");
  }
  const parts = ["  ✓"];
  if (meta.exitCode !== undefined) {
    parts.push(`exit ${meta.exitCode}`);
  }
  if (meta.durationMs !== undefined) {
    parts.push(formatDuration(meta.durationMs));
  }
  return parts.join(" ");
}

/** One-line activity log entry for journal v3. */
export function formatToolCallLine(
  toolCall: ToolCall,
  status: ToolCallLineStatus,
  meta: ToolCallLineMeta = {},
): string {
  return `${formatToolCallArgs(toolCall, meta)}${formatStatusSuffix(status, meta)}`;
}

export function metaFromFinished(finished: ToolFinishedLike): ToolCallLineMeta {
  return {
    ...(finished.durationMs === undefined ? {} : { durationMs: finished.durationMs }),
    ...(finished.exitCode === undefined ? {} : { exitCode: finished.exitCode }),
    ...(finished.error === undefined ? {} : { error: finished.error }),
    ...(finished.filePath === undefined ? {} : { filePath: finished.filePath }),
  };
}

export function formatToolCallLineFromResult(payload: Record<string, unknown>): string | null {
  const finished = toolPayloadToFinishedLike(payload);
  if (finished === null) {
    return null;
  }
  const status: ToolCallLineStatus = finished.success ? "done" : "failed";
  return formatToolCallLine(finished.toolCall, status, metaFromFinished(finished));
}

export function formatSystemActivityLine(
  kind: "thinking" | "verify" | "compact" | "reasoning",
  detail: string,
  status: ToolCallLineStatus = "pending",
): string {
  const name = kind.padEnd(11);
  const suffix = status === "pending" ? "  …" : status === "done" ? "  ✓" : "  ×";
  return `${name} ${detail}${suffix}`;
}
