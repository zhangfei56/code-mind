import { resolve } from "node:path";
import type { AgentMode, AgentEvent, SessionStatus, ActivityKind, TokenUsage } from "@code-mind/shared";
import { AGENT_MODES } from "@code-mind/shared";
import { CLI_BIN_NAME } from "../cli/cli-name.js";
import { ValidationError } from "@code-mind/shared";
import { renderAgentEventLine } from "../ui/event-lines.js";
import { shortPath, theme } from "../ui/theme.js";

export interface InteractiveState {
  cwd: string;
  model: string | undefined;
  mode: AgentMode;
  maxSteps: number;
  sessionId: string | undefined;
  sessionStatus: SessionStatus;
  hasActiveTurn: boolean;
  currentStep: number;
  currentActivity: ActivityKind;
  activityDetail?: string;
  currentAction?: string;
  recentEvents: string[];
  verbose: boolean;
  filesRead: string[];
  filesChanged: string[];
  commandsRun: number;
  compactionCount: number;
  promptMessageCount: number;
  contextTokens: number | undefined;
  maxContextTokens: number | undefined;
  tokenUsage: TokenUsage | undefined;
  lastShellOutput: string | undefined;
  journalExpand?: (() => string[]) | undefined;
  replThinkingExpand?: (() => string) | undefined;
  replReasonExpand?: (() => string) | undefined;
}

export type InteractiveCommand =
  | { type: "help" }
  | { type: "exit" }
  | { type: "status" }
  | { type: "new" }
  | { type: "sessions" }
  | { type: "abort" }
  | { type: "approvals" }
  | { type: "approve"; approvalId?: string }
  | { type: "deny"; approvalId?: string }
  | { type: "resume"; sessionId: string }
  | { type: "model"; model: string }
  | { type: "cwd"; cwd: string }
  | { type: "max_steps"; maxSteps: number }
  | { type: "verbose" }
  | { type: "diff" }
  | { type: "context" }
  | { type: "cost" }
  | { type: "tools" }
  | { type: "permissions" }
  | { type: "expand" }
  | { type: "reason" }
  | { type: "approve_always"; approvalId?: string };

export function parseInteractiveCommand(input: string): InteractiveCommand {
  const trimmed = input.trim();
  const [command, ...rest] = trimmed.slice(1).split(/\s+/).filter(Boolean);

  switch (command) {
    case "help":
      return { type: "help" };
    case "exit":
    case "quit":
      return { type: "exit" };
    case "status":
      return { type: "status" };
    case "new":
      return { type: "new" };
    case "sessions":
      return { type: "sessions" };
    case "abort":
      return { type: "abort" };
    case "approvals":
      return { type: "approvals" };
    case "approve":
      return { type: "approve", ...(rest[0] === undefined ? {} : { approvalId: rest[0] }) };
    case "deny":
      return { type: "deny", ...(rest[0] === undefined ? {} : { approvalId: rest[0] }) };
    case "resume":
      if (!rest[0]) {
        throw new ValidationError("Usage: /resume <session-id>");
      }
      return { type: "resume", sessionId: rest[0] };
    case "mode":
      throw new ValidationError(
        "Mode cannot be changed during an interactive session. Restart with --mode or use ask/plan/edit/agent subcommands.",
      );
    case "model":
      if (!rest[0]) {
        throw new ValidationError("Usage: /model <name>");
      }
      return { type: "model", model: rest.join(" ") };
    case "cwd":
      if (!rest[0]) {
        throw new ValidationError("Usage: /cwd <path>");
      }
      return { type: "cwd", cwd: resolve(rest.join(" ")) };
    case "max-steps":
      if (!rest[0]) {
        throw new ValidationError("Usage: /max-steps <number>");
      }
      return parseMaxSteps(rest[0]);
    case "verbose":
      return { type: "verbose" };
    case "diff":
      return { type: "diff" };
    case "context":
      return { type: "context" };
    case "cost":
      return { type: "cost" };
    case "tools":
      return { type: "tools" };
    case "permissions":
      return { type: "permissions" };
    case "expand":
      return { type: "expand" };
    case "reason":
      return { type: "reason" };
    case "approve-always":
    case "approve_always":
      return {
        type: "approve_always",
        ...(rest[0] === undefined ? {} : { approvalId: rest[0] }),
      };
    default:
      throw new ValidationError(`Unknown interactive command: /${command ?? ""}`);
  }
}

function parseMaxSteps(value: string): InteractiveCommand {
  const maxSteps = Number.parseInt(value, 10);
  if (!Number.isInteger(maxSteps) || maxSteps <= 0) {
    throw new ValidationError("Expected /max-steps to be a positive integer");
  }
  return { type: "max_steps", maxSteps };
}

export function renderInteractiveHelp(): string {
  return [
    "Commands",
    "  /help",
    "  /status",
    "  /model <name>",
    "  /cwd <path>",
    "  /max-steps <number>",
    "  /verbose",
    "  /diff",
    "  /context",
    "  /cost",
    "  /tools",
    "  /permissions",
    "  /reason",
    "  /expand",
    "  /sessions",
    "  /abort",
    "  /approvals",
    "  /approve [approval-id]",
    "  /approve-always [approval-id]",
    "  /deny [approval-id]",
    "  /resume <session-id>",
    "  /new",
    "  /exit",
    "",
    "Mode is fixed for the session. Restart with:",
    `  ${CLI_BIN_NAME} --mode <${AGENT_MODES.join("|")}>`,
    `  ${CLI_BIN_NAME} <ask|plan|edit|agent> "<task>"`,
  ].join("\n");
}

export function renderInteractiveStatus(state: InteractiveState): string {
  const recent = state.recentEvents.length > 0
    ? state.recentEvents.slice(-3).map((event) => `  ${theme.dim(event)}`).join("\n")
    : `  ${theme.dim("none")}`;
  return [
    theme.bold("code-mind"),
    `  ${theme.dim("cwd")}     ${shortPath(state.cwd)}`,
    `  ${theme.dim("model")}   ${state.model ?? "default"}`,
    `  ${theme.dim("mode")}    ${state.mode}`,
    `  ${theme.dim("session")} ${state.sessionId ?? "none"}`,
    `  ${theme.dim("status")}  ${state.sessionStatus}`,
    `  ${theme.dim("step")}    ${state.currentStep}/${state.maxSteps}`,
    `  ${theme.dim("activity")} ${state.currentActivity}${state.activityDetail ? ` · ${state.activityDetail}` : ""}`,
    `  ${theme.dim("recent")}`,
    recent,
  ].join("\n");
}

export function renderAgentEvent(event: AgentEvent): string | null {
  return renderAgentEventLine(event, { verbose: true });
}