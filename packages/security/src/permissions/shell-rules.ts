import type { AgentMode } from "@code-mind/shared";

const SAFE_COMMANDS = [
  "npm test",
  "npm run test",
  "npm run lint",
  "npm run build",
  "pnpm test",
  "pnpm run lint",
  "pytest",
  "cargo test",
] as const;

const READ_ONLY_COMMANDS = [
  "git status",
  "git diff",
  "pwd",
  "ls",
  "ls -la",
] as const;

const ASK_COMMAND_PATTERNS = [/^npm install\b/, /^pnpm install\b/, /^git commit\b/];
const DENY_COMMAND_PATTERNS = [
  /^rm -rf\b/,
  /^sudo\b/,
  /^git push\b/,
  /^curl\s+.+\|\s*sh\b/,
  /^wget\s+.+\|\s*bash\b/,
  /^chmod 777\b/,
];

export type ShellPermission = "allow" | "ask" | "deny";

function isKnownCommand(
  command: string,
  knownCommands: readonly string[],
): boolean {
  return knownCommands.includes(command);
}

export function getShellPermission(
  command: string,
  mode: AgentMode,
): ShellPermission {
  const normalized = command.trim();

  if (DENY_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "deny";
  }

  if (isKnownCommand(normalized, READ_ONLY_COMMANDS)) {
    return "allow";
  }

  if (mode === "ask") {
    return "deny";
  }

  if (isKnownCommand(normalized, SAFE_COMMANDS)) {
    return mode === "agent" ? "allow" : "ask";
  }

  if (ASK_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "ask";
  }

  return mode === "agent" ? "ask" : "ask";
}
