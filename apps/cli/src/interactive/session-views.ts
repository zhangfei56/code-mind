import { GitManager, ToolRegistry, registerDefaultTools } from "@code-mind/execution";
import type { AgentMode, AgentEvent, TokenUsage } from "@code-mind/shared";
import { toolPayloadToFinishedLike } from "../ui/agent-output/tool-blocks.js";
import { securityInfoForMode } from "../ui/header-details.js";
import { formatContextUsage, formatTokenUsageSummary } from "../ui/format.js";
import { shortPath } from "../ui/theme.js";
import type { InteractiveState } from "./commands.js";

export function renderInteractiveActivityPanel(state: InteractiveState): string {
  const activity =
    state.currentAction && state.currentAction !== "idle"
      ? `~ ${state.currentAction}`
      : "~ idle";
  const contextLines = [
    `Files read: ${state.filesRead.length}`,
    `Files changed: ${state.filesChanged.length}`,
    `Commands run: ${state.commandsRun}`,
    `Tokens: ${state.tokenUsage ? formatTokenUsageSummary(state.tokenUsage) : "n/a"}`,
  ];

  return [
    "Activity                     Context",
    `  ${activity.padEnd(26)}  ${contextLines[0]}`,
    `  step ${state.currentStep}/${state.maxSteps} · ${state.currentActivity}`.padEnd(28) +
      contextLines[1],
    `  status ${state.sessionStatus}`.padEnd(28) + contextLines[2],
    "".padEnd(28) + contextLines[3],
  ].join("\n");
}

export async function renderInteractiveDiff(state: InteractiveState): Promise<string> {
  const git = new GitManager();
  const changed = await git.changedFiles(state.cwd);
  const all = [...changed.modified, ...changed.untracked, ...changed.deleted];
  if (all.length === 0) {
    return "No workspace changes detected.";
  }

  const lines = ["Diff summary", ""];
  for (const path of changed.untracked) {
    lines.push(`  A ${shortPath(path)}`);
  }
  for (const path of changed.modified) {
    lines.push(`  M ${shortPath(path)}`);
  }
  for (const path of changed.deleted) {
    lines.push(`  D ${shortPath(path)}`);
  }
  lines.push("", "Use git diff for full patch output.");
  return lines.join("\n");
}

export function renderInteractiveContext(state: InteractiveState): string {
  const lines = [
    "Context",
    "",
    "Session",
    `  ID: ${state.sessionId ?? "none"}`,
    `  Step: ${state.currentStep}/${state.maxSteps}`,
    `  Activity: ${state.currentActivity}${state.activityDetail ? ` · ${state.activityDetail}` : ""}`,
    "",
    "Activity",
    `  Files read: ${state.filesRead.length}`,
    `  Files changed: ${state.filesChanged.length}`,
    `  Commands run: ${state.commandsRun}`,
    `  Messages: ${state.promptMessageCount || "n/a"}`,
    `  Context: ${
      state.contextTokens === undefined
        ? "n/a"
        : formatContextUsage(state.contextTokens, state.maxContextTokens)
    }`,
    `  Compactions: ${state.compactionCount}`,
  ];

  if (state.filesRead.length > 0) {
    lines.push("", "Included");
    for (const file of state.filesRead.slice(-8)) {
      lines.push(`  ${shortPath(file)}`);
    }
    if (state.filesRead.length > 8) {
      lines.push(`  ... ${state.filesRead.length - 8} more`);
    }
  }

  if (state.tokenUsage) {
    lines.push("", "Tokens", `  ${formatTokenUsageSummary(state.tokenUsage)}`);
  }

  return lines.join("\n");
}

export function renderInteractiveCost(state: InteractiveState): string {
  if (!state.tokenUsage) {
    return "No token usage recorded for the current session yet.";
  }
  return ["Cost", "", `  ${formatTokenUsageSummary(state.tokenUsage)}`, ""].join("\n");
}

export async function renderInteractiveTools(mode: AgentMode): Promise<string> {
  const registry = new ToolRegistry();
  registerDefaultTools(registry);
  const schemas = registry.getSchemasForMode(mode);
  const lines = ["Tools", "", "Enabled"];
  for (const schema of schemas) {
    lines.push(`  ${schema.name.padEnd(12)} ${schema.description ?? ""}`.trimEnd());
  }
  return lines.join("\n");
}

export function renderInteractivePermissions(mode: AgentMode): string {
  const security = securityInfoForMode(mode);
  return [
    "Permissions",
    "",
    "Approval mode",
    `  ${security.approval}`,
    "",
    "Sandbox",
    `  ${security.sandbox}`,
    "",
    "Network",
    `  ${security.network}`,
    "",
    "Auto allowed",
    "  read files in workspace",
    "  search files",
    "  run git status",
    "",
    "Needs approval",
    "  modify files (edit mode)",
    "  install dependencies",
    "  access network",
    "  delete files",
  ].join("\n");
}

export function renderInteractiveExpand(state: InteractiveState): string {
  const thinking = state.replThinkingExpand?.();
  if (thinking && !thinking.startsWith("No active")) {
    return thinking;
  }
  const journalLines = state.journalExpand?.() ?? [];
  if (journalLines.length > 0) {
    return ["Expanded step", ...journalLines.map((line) => (line.startsWith("  ") ? line : `  ${line}`)), ""].join("\n");
  }
  if (!state.lastShellOutput?.trim()) {
    return "No recent shell output or folded step to expand.";
  }
  return ["Output", ...state.lastShellOutput.split("\n").map((line) => `  ${line}`), ""].join("\n");
}

export function applyInteractiveActivity(state: InteractiveState, event: AgentEvent): void {
  switch (event.kind) {
    case "tool.result": {
      const finished = toolPayloadToFinishedLike(event.payload);
      if (finished === null) {
        break;
      }
      const args = (finished.toolCall.arguments ?? {}) as Record<string, unknown>;
      if (finished.toolCall.name === "read_file" && typeof args.path === "string" && finished.success) {
        if (!state.filesRead.includes(args.path)) {
          state.filesRead.push(args.path);
        }
      }
      if (
        (finished.toolCall.name === "apply_patch" ||
          finished.toolCall.name === "write_file" ||
          finished.toolCall.name === "search_replace" ||
          finished.toolCall.name === "delete_file" ||
          finished.toolCall.name === "move_file") &&
        finished.success
      ) {
        const path =
          finished.filePath ??
          (typeof args.path === "string"
            ? args.path
            : typeof args.to === "string"
              ? args.to
              : "patched file");
        if (!state.filesChanged.includes(path)) {
          state.filesChanged.push(path);
        }
      }
      if (finished.toolCall.name === "run_shell") {
        const output = finished.outputPreview;
        if (output) {
          state.lastShellOutput = output;
        }
        if (finished.success) {
          state.commandsRun += 1;
        }
      }
      break;
    }
    case "context.compacted":
      state.compactionCount += 1;
      break;
    case "context.compaction_failed":
      break;
    case "model.request": {
      const messageCount = (event.payload as { messageCount?: number }).messageCount;
      if (typeof messageCount === "number") {
        state.promptMessageCount = messageCount;
      }
      const payload = event.payload as {
        contextTokens?: number;
        maxContextTokens?: number;
      };
      if (typeof payload.contextTokens === "number") {
        state.contextTokens = payload.contextTokens;
      }
      if (typeof payload.maxContextTokens === "number") {
        state.maxContextTokens = payload.maxContextTokens;
      }
      break;
    }
    case "model.response": {
      const payload = event.payload as {
        contextTokens?: number;
        maxContextTokens?: number;
        messageCount?: number;
      };
      if (typeof payload.contextTokens === "number") {
        state.contextTokens = payload.contextTokens;
      }
      if (typeof payload.maxContextTokens === "number") {
        state.maxContextTokens = payload.maxContextTokens;
      }
      if (typeof payload.messageCount === "number") {
        state.promptMessageCount = payload.messageCount;
      }
      break;
    }
    case "turn.finished":
      if (event.payload.tokenUsage) {
        state.tokenUsage = event.payload.tokenUsage as TokenUsage;
      }
      if (typeof event.payload.contextTokens === "number") {
        state.contextTokens = event.payload.contextTokens;
      }
      if (typeof event.payload.maxContextTokens === "number") {
        state.maxContextTokens = event.payload.maxContextTokens;
      }
      break;
    default:
      break;
  }
}

export function createEmptyActivityState(): {
  filesRead: string[];
  filesChanged: string[];
  commandsRun: number;
  compactionCount: number;
  promptMessageCount: number;
  contextTokens: number | undefined;
  maxContextTokens: number | undefined;
  tokenUsage: TokenUsage | undefined;
  lastShellOutput: string | undefined;
} {
  return {
    filesRead: [],
    filesChanged: [],
    commandsRun: 0,
    compactionCount: 0,
    promptMessageCount: 0,
    contextTokens: undefined,
    maxContextTokens: undefined,
    tokenUsage: undefined,
    lastShellOutput: undefined,
  };
}
