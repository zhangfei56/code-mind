import type { ToolCall } from "@code-mind/shared";
import { parsePatch } from "@code-mind/shared";
import { buildPatchPreview } from "@code-mind/execution";
import type { DisplayLevel } from "../display-level.js";
import { formatDuration } from "../format.js";
import { shortPath, theme } from "../theme.js";

export interface ToolFinishedLike {
  toolCall: ToolCall;
  success: boolean;
  error?: string;
  durationMs?: number;
  outputPreview?: string;
  exitCode?: number;
  filePath?: string;
}

export interface ToolBlockOptions {
  level: DisplayLevel;
  stream?: NodeJS.WriteStream;
}

function toolArgs(toolCall: ToolCall): Record<string, unknown> {
  return (toolCall.arguments ?? {}) as Record<string, unknown>;
}

function pathText(path: string, stream?: NodeJS.WriteStream): string {
  return theme.magenta(shortPath(path), stream);
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

function grepResultSummary(output?: string): string {
  if (!output?.trim()) {
    return "completed";
  }
  const lines = output.trim().split("\n").filter(Boolean);
  if (lines.length === 0) {
    return "0 matches";
  }
  if (lines.length === 1) {
    return lines[0]!;
  }
  return `${lines.length} matches`;
}

const MAX_OUTPUT_LINES = 8;

function formatOutputSection(output: string, verbose: boolean): string[] {
  const rawLines = output.split("\n");
  const lines: string[] = ["Output"];

  if (verbose || rawLines.length <= MAX_OUTPUT_LINES) {
    for (const line of rawLines) {
      lines.push(`  ${line}`);
    }
    return lines;
  }

  for (const line of rawLines.slice(0, 5)) {
    lines.push(`  ${line}`);
  }
  lines.push(`  ... ${rawLines.length - 5} lines hidden`);
  if (!verbose) {
    lines.push("Hint");
    lines.push("  Use --verbose or /expand last to show full output.");
  }
  return lines;
}

function formatRunBlock(event: ToolFinishedLike, options: ToolBlockOptions): string[] {
  const args = toolArgs(event.toolCall);
  const command = typeof args.command === "string" ? args.command : String(event.toolCall.name);
  const verbose = options.level >= 2;
  const stream = options.stream;
  const lines: string[] = [];

  if (options.level === 0) {
    const glyph = event.success ? "✓" : "×";
    const suffix = event.error ? `: ${event.error}` : "";
    lines.push(`  ${glyph} Run ${command}${suffix}`);
    return lines;
  }

  lines.push("Run");
  lines.push(`  ${theme.cyan(command, stream)}`);

  if (event.outputPreview) {
    lines.push(...formatOutputSection(event.outputPreview, verbose));
  }

  lines.push("Exit");
  if (event.exitCode !== undefined) {
    lines.push(`  code: ${event.exitCode}`);
  } else if (event.success) {
    lines.push("  code: 0");
  } else {
    lines.push(`  code: failed`);
  }
  if (event.durationMs !== undefined) {
    lines.push(`  time: ${formatDuration(event.durationMs)}`);
  }
  if (!event.success && event.error) {
    lines.push(`  error: ${event.error}`);
  }

  return lines;
}

function formatEditBlock(event: ToolFinishedLike, options: ToolBlockOptions): string[] {
  const args = toolArgs(event.toolCall);
  const filePath =
    event.filePath ?? resolvePatchPath(args.patch) ?? "unknown file";
  const stream = options.stream;

  if (options.level === 0) {
    const glyph = event.success ? "M" : "×";
    return [`  ${glyph} ${shortPath(filePath)}`];
  }

  const lines: string[] = [`Edit ${pathText(filePath, stream)}`];
  if (event.success) {
    lines.push("Changed");
    lines.push(`  ${shortPath(filePath)}`);
    if (options.level >= 2 && typeof args.patch === "string") {
      const preview = buildPatchPreview(args.patch);
      for (const line of preview.split("\n").slice(0, 12)) {
        lines.push(`  ${line}`);
      }
      const total = preview.split("\n").length;
      if (total > 12) {
        lines.push(`  ... ${total - 12} diff lines hidden`);
      }
    }
  } else {
    lines.push(`  × ${event.error ?? "patch failed"}`);
  }
  return lines;
}

function formatReadBlock(event: ToolFinishedLike, options: ToolBlockOptions): string[] {
  const args = toolArgs(event.toolCall);
  const filePath = typeof args.path === "string" ? args.path : "unknown";

  if (options.level === 0) {
    const glyph = event.success ? "✓" : "×";
    const suffix = event.success ? "" : `: ${event.error ?? "failed"}`;
    return [`  ${glyph} Read ${shortPath(filePath)}${suffix}`];
  }

  const lines: string[] = ["Read"];
  lines.push(`  ${pathText(filePath, options.stream)}`);
  if (!event.success) {
    lines.push(`  × ${event.error ?? "failed"}`);
  }
  return lines;
}

function formatListBlock(event: ToolFinishedLike, options: ToolBlockOptions): string[] {
  const args = toolArgs(event.toolCall);
  const dirPath = typeof args.path === "string" ? args.path : ".";

  if (options.level === 0) {
    const glyph = event.success ? "✓" : "×";
    return [`  ${glyph} Listed ${shortPath(dirPath)}`];
  }

  const lines: string[] = ["Inspect"];
  lines.push(`  ${pathText(dirPath, options.stream)}`);
  if (event.outputPreview && options.level >= 2) {
    const entries = event.outputPreview.split("\n").slice(0, 6);
    for (const entry of entries) {
      lines.push(`  ${entry}`);
    }
    const total = event.outputPreview.split("\n").length;
    if (total > 6) {
      lines.push(`  ... ${total - 6} more entries`);
    }
  }
  return lines;
}

function formatSearchBlock(event: ToolFinishedLike, options: ToolBlockOptions): string[] {
  const args = toolArgs(event.toolCall);
  const pattern = typeof args.pattern === "string" ? args.pattern : "";
  const result = grepResultSummary(event.outputPreview);

  if (options.level === 0) {
    const glyph = event.success ? "✓" : "×";
    return [`  ${glyph} Search "${pattern}" — ${result}`];
  }

  const lines: string[] = ["Search", `  query: "${pattern}"`, `  result: ${result}`];
  if (!event.success && event.error) {
    lines.push(`  × ${event.error}`);
  }
  return lines;
}

function formatGlobBlock(event: ToolFinishedLike, options: ToolBlockOptions): string[] {
  const args = toolArgs(event.toolCall);
  const pattern = typeof args.pattern === "string" ? args.pattern : "";
  const count = event.outputPreview
    ? event.outputPreview.split("\n").filter((line) => line.trim().length > 0).length
    : 0;

  if (options.level === 0) {
    const glyph = event.success ? "✓" : "×";
    return [`  ${glyph} Glob "${pattern}" — ${count} match${count === 1 ? "" : "es"}`];
  }

  const lines: string[] = ["Glob", `  pattern: "${pattern}"`, `  matches: ${count}`];
  if (!event.success && event.error) {
    lines.push(`  × ${event.error}`);
  }
  return lines;
}

function formatGenericBlock(event: ToolFinishedLike, options: ToolBlockOptions): string[] {
  if (event.toolCall.name.startsWith("mcp_")) {
    return formatMcpBlock(event, options);
  }

  if (options.level === 0) {
    const glyph = event.success ? "✓" : "×";
    const suffix = event.success ? "" : `: ${event.error ?? "failed"}`;
    return [`  ${glyph} ${event.toolCall.name}${suffix}`];
  }

  const lines: string[] = ["Tool", `  name: ${event.toolCall.name}`];
  if (!event.success) {
    lines.push(`  × ${event.error ?? "failed"}`);
  } else if (event.outputPreview) {
    lines.push(`  result: ${event.outputPreview.split("\n")[0]}`);
  }
  return lines;
}

function formatMcpBlock(event: ToolFinishedLike, options: ToolBlockOptions): string[] {
  const args = toolArgs(event.toolCall);
  const server = typeof args.server === "string" ? args.server : "unknown";
  const tool = typeof args.tool === "string" ? args.tool : event.toolCall.name.replace(/^mcp_/, "");

  if (options.level === 0) {
    const glyph = event.success ? "✓" : "×";
    return [`  ${glyph} MCP ${server}/${tool}`];
  }

  const lines = ["MCP", `  server: ${server}`, `  tool: ${tool}`];
  const argSummary = Object.entries(args)
    .filter(([key]) => key !== "server" && key !== "tool")
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ");
  if (argSummary) {
    lines.push(`  args: ${argSummary}`);
  }
  if (event.outputPreview) {
    lines.push("Result");
    lines.push(`  ${event.outputPreview.split("\n")[0]}`);
  }
  return lines;
}

function formatSubagentBlock(event: ToolFinishedLike, options: ToolBlockOptions): string[] {
  const args = toolArgs(event.toolCall);
  const agentName = typeof args.agentName === "string" ? args.agentName : "subagent";
  const task = typeof args.task === "string" ? args.task.trim() : "";

  if (options.level === 0) {
    const glyph = event.success ? "✓" : "×";
    const suffix = event.success ? "" : `: ${event.error ?? "failed"}`;
    return [`  ${glyph} Sub-agent ${agentName}${suffix}`];
  }

  const lines = ["Sub-agent", `  ${agentName}`];
  if (task) {
    lines.push(`  task: ${task.length > 120 ? `${task.slice(0, 117)}...` : task}`);
  }
  if (!event.success) {
    lines.push(`  × ${event.error ?? "failed"}`);
  } else if (event.outputPreview) {
    const preview = event.outputPreview.trim().split("\n").slice(0, 6);
    lines.push("Summary");
    for (const line of preview) {
      lines.push(`  ${line}`);
    }
    if (event.outputPreview.trim().split("\n").length > preview.length) {
      lines.push("  ...");
    }
  }
  return lines;
}

/** Parse a tool.result event payload into a shape suitable for formatting. */
export function toolPayloadToFinishedLike(payload: Record<string, unknown>): ToolFinishedLike | null {
  const call = payload.toolCall;
  if (typeof call !== "object" || call === null) {
    return null;
  }
  const record = call as Record<string, unknown>;
  const toolCall: ToolCall = {
    id: String(record.id ?? ""),
    name: String(record.name ?? "unknown"),
    arguments:
      typeof record.arguments === "object" && record.arguments !== null
        ? (record.arguments as Record<string, unknown>)
        : {},
  };
  return {
    toolCall,
    success: payload.success === true,
    ...(typeof payload.error === "string" ? { error: payload.error } : {}),
    ...(typeof payload.durationMs === "number" ? { durationMs: payload.durationMs } : {}),
    ...(typeof payload.outputPreview === "string"
      ? { outputPreview: payload.outputPreview }
      : typeof payload.output === "string"
        ? { outputPreview: payload.output }
        : {}),
    ...(typeof payload.exitCode === "number" ? { exitCode: payload.exitCode } : {}),
    ...(typeof payload.filePath === "string" ? { filePath: payload.filePath } : {}),
  };
}

export function formatToolBlockFromPayload(
  payload: Record<string, unknown>,
  options: ToolBlockOptions,
): string[] {
  const like = toolPayloadToFinishedLike(payload);
  return like === null ? [] : formatToolBlock(like, options);
}

export function formatToolBlock(event: ToolFinishedLike, options: ToolBlockOptions): string[] {
  switch (event.toolCall.name) {
    case "read_file":
      return formatReadBlock(event, options);
    case "list_dir":
      return formatListBlock(event, options);
    case "grep":
      return formatSearchBlock(event, options);
    case "glob":
      return formatGlobBlock(event, options);
    case "run_shell":
      return formatRunBlock(event, options);
    case "apply_patch":
    case "write_file":
    case "search_replace":
    case "delete_file":
    case "move_file":
      return formatEditBlock(event, options);
    case "run_subagent":
      return formatSubagentBlock(event, options);
    default:
      return formatGenericBlock(event, options);
  }
}

export function isHighRiskTool(toolCall: ToolCall): boolean {
  const args = toolArgs(toolCall);
  if (toolCall.name === "run_shell") {
    const command = typeof args.command === "string" ? args.command : "";
    return /rm\s+-rf|sudo|curl\s+|wget\s+|pnpm\s+(add|install)|npm\s+install/.test(command);
  }
  if (toolCall.name === "apply_patch") {
    const path = resolvePatchPath(args.patch);
    return path === undefined || /(^|\/)(\.env|secrets\/)/.test(path);
  }
  if (toolCall.name === "write_file" || toolCall.name === "search_replace" || toolCall.name === "delete_file") {
    const path = typeof args.path === "string" ? args.path : "";
    return path.length === 0 || /(^|\/)(\.env|secrets\/)/.test(path);
  }
  if (toolCall.name === "move_file") {
    const from = typeof args.from === "string" ? args.from : "";
    const to = typeof args.to === "string" ? args.to : "";
    return [from, to].some(
      (path) => path.length === 0 || /(^|\/)(\.env|secrets\/)/.test(path),
    );
  }
  return toolCall.name.startsWith("mcp_");
}

export function riskHintForTool(toolCall: ToolCall): string {
  const args = toolArgs(toolCall);
  switch (toolCall.name) {
    case "run_shell": {
      const command = typeof args.command === "string" ? args.command : "";
      if (/pnpm\s+(add|install)|npm\s+install|yarn\s+add/.test(command)) {
        return "Downloads packages and may modify lockfile.";
      }
      if (/rm\s+-rf|sudo/.test(command)) {
        return "Destructive or privileged shell command.";
      }
      return "Executes a shell command in the workspace.";
    }
    case "apply_patch":
      return "Modifies workspace files.";
    case "write_file":
      return "Creates or overwrites a workspace file.";
    case "search_replace":
      return "Replaces text in a workspace file.";
    case "delete_file":
      return "Deletes a workspace file.";
    case "move_file":
      return "Moves or renames a workspace file.";
    default:
      return "Requires explicit approval before proceeding.";
  }
}

export function formatApprovalAction(toolCall: ToolCall): string[] {
  const args = toolArgs(toolCall);
  switch (toolCall.name) {
    case "run_shell": {
      const command = typeof args.command === "string" ? args.command : toolCall.name;
      return ["  Run command:", `  ${command}`];
    }
    case "apply_patch": {
      const path = resolvePatchPath(args.patch);
      return path ? ["  Apply patch:", `  ${path}`] : ["  Apply patch"];
    }
    case "write_file": {
      const path = typeof args.path === "string" ? args.path : "unknown file";
      return ["  Write file:", `  ${path}`];
    }
    case "search_replace": {
      const path = typeof args.path === "string" ? args.path : "unknown file";
      return ["  Search/replace:", `  ${path}`];
    }
    case "delete_file": {
      const path = typeof args.path === "string" ? args.path : "unknown file";
      return ["  Delete file:", `  ${path}`];
    }
    case "move_file": {
      const from = typeof args.from === "string" ? args.from : "unknown file";
      const to = typeof args.to === "string" ? args.to : "unknown file";
      return ["  Move file:", `  ${from} → ${to}`];
    }
    case "run_subagent": {
      const agentName = typeof args.agentName === "string" ? args.agentName : "subagent";
      const task = typeof args.task === "string" ? args.task : "";
      return [
        `  Sub-agent · ${agentName}`,
        ...(task ? [`  ${task}`] : []),
      ];
    }
    default:
      return [`  ${toolCall.name}`];
  }
}
