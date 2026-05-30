import type { DisplayLevel } from "../display-level.js";
import { shortPath, theme } from "../theme.js";
import { formatDuration } from "../format.js";
import type { ToolFinishedLike } from "./tool-blocks.js";
import { toolPayloadToFinishedLike } from "./tool-blocks.js";

function toolArgs(toolCall: ToolFinishedLike["toolCall"]): Record<string, unknown> {
  return (toolCall.arguments ?? {}) as Record<string, unknown>;
}

export function renderToolFailureBlock(
  payload: Record<string, unknown>,
  options: { level: DisplayLevel; stream?: NodeJS.WriteStream } = { level: 0 },
): string[] {
  const event = toolPayloadToFinishedLike(payload);
  if (event === null || event.success) {
    return [];
  }

  switch (event.toolCall.name) {
    case "run_shell":
      return renderCommandFailedBlock(event, options);
    case "read_file":
      return renderFileNotFoundBlock(event);
    default:
      return renderGenericFailureBlock(event);
  }
}

function renderCommandFailedBlock(
  event: ToolFinishedLike,
  options: { level: DisplayLevel; stream?: NodeJS.WriteStream },
): string[] {
  const args = toolArgs(event.toolCall);
  const command = typeof args.command === "string" ? args.command : event.toolCall.name;
  const lines = ["", theme.yellow("Command failed", options.stream), "", "Run", `  ${command}`, "Exit"];

  if (event.exitCode !== undefined) {
    lines.push(`  code: ${event.exitCode}`);
  }
  if (event.durationMs !== undefined) {
    lines.push(`  time: ${formatDuration(event.durationMs)}`);
  }

  lines.push("", "Summary");
  lines.push(`  ${event.error ?? "Shell command failed."}`);

  if (event.outputPreview && options.level >= 2) {
    lines.push("", "Relevant output");
    for (const line of event.outputPreview.split("\n").slice(-6)) {
      lines.push(`  ${line}`);
    }
  }

  lines.push("", "Next", "  Inspect the command output and rerun with a narrower fix target.", "");
  return lines;
}

function renderFileNotFoundBlock(event: ToolFinishedLike): string[] {
  const args = toolArgs(event.toolCall);
  const path = typeof args.path === "string" ? args.path : "unknown";
  return [
    "",
    "File not found",
    `  ${shortPath(path)}`,
    "",
    "What happened",
    `  ${event.error ?? "The requested file does not exist in the workspace."}`,
    "",
    "Next",
    "  Inspect the directory structure and choose an existing path.",
    "",
  ];
}

function renderGenericFailureBlock(event: ToolFinishedLike): string[] {
  return [
    "",
    "Tool failed",
    `  ${event.toolCall.name}`,
    "",
    "Summary",
    `  ${event.error ?? "The tool call did not succeed."}`,
    "",
    "Next",
    "  Retry with corrected arguments or a narrower task scope.",
    "",
  ];
}
