const ALLOW_COMMANDS = [
  "npm test",
  "npm run test",
  "npm run lint",
  "npm run build",
  "pnpm test",
  "pnpm run lint",
  "pytest",
  "cargo test",
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

export function getShellPermission(
  command: string,
): "allow" | "ask" | "deny" {
  const normalized = command.trim();

  if (ALLOW_COMMANDS.includes(normalized as (typeof ALLOW_COMMANDS)[number])) {
    return "allow";
  }

  if (DENY_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "deny";
  }

  if (ASK_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "ask";
  }

  return "ask";
}
