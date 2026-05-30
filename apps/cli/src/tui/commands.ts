export const TUI_SLASH_COMMANDS = [
  "abort",
  "approvals",
  "approve",
  "approve-always",
  "context",
  "deny",
  "diff",
  "events",
  "evidence",
  "exit",
  "expand",
  "help",
  "model",
  "permissions",
  "quit",
  "reason",
  "status",
  "verbose",
] as const;

export type TuiSlashCommand = (typeof TUI_SLASH_COMMANDS)[number];

const TUI_COMMAND_DESCRIPTIONS: Record<TuiSlashCommand, string> = {
  abort: "interrupt the active turn",
  approvals: "show pending approvals",
  approve: "approve current or named approval",
  "approve-always": "approve and remember this action",
  context: "show files, tokens, and session context",
  deny: "deny current or named approval",
  diff: "show latest diff or evidence",
  events: "show raw recent runtime events",
  evidence: "show latest diff or evidence",
  exit: "leave TUI",
  expand: "show more activity rows",
  help: "show contextual help",
  model: "switch model for next turn",
  permissions: "show active permission policy",
  quit: "leave TUI",
  reason: "show reasoning summary",
  status: "show current session status",
  verbose: "toggle verbose output",
};

export function describeSlashCommand(command: TuiSlashCommand): string {
  return TUI_COMMAND_DESCRIPTIONS[command];
}

export function listSlashCommandMatches(prefix: string): TuiSlashCommand[] {
  const normalized = prefix.startsWith("/") ? prefix.slice(1) : prefix;
  if (/\s/.test(normalized)) {
    return [];
  }
  return TUI_SLASH_COMMANDS.filter((command) => command.startsWith(normalized));
}

export function completeSlashCommand(input: string, cycleIndex = 0): string {
  if (!input.startsWith("/")) {
    return input;
  }
  const partial = input.slice(1);
  const matches = listSlashCommandMatches(partial);
  if (matches.length === 0) {
    return input;
  }
  if (matches.length === 1) {
    return `/${matches[0]}`;
  }
  const next = matches[cycleIndex % matches.length]!;
  return `/${next}`;
}

export function renderSlashCommandCompletions(input: string, activeIndex = 0): string {
  const matches = listSlashCommandMatches(input);
  if (!input.startsWith("/") || matches.length === 0) {
    return "";
  }
  return matches
    .slice(0, 8)
    .map((command, index) => {
      const selected = index === activeIndex % matches.length;
      const marker = selected ? "{yellow-fg}›{/yellow-fg}" : " ";
      const color = selected ? "yellow" : "cyan";
      return `${marker} {${color}-fg}/${command}{/${color}-fg} {gray-fg}${TUI_COMMAND_DESCRIPTIONS[command]}{/gray-fg}`;
    })
    .join("\n");
}
