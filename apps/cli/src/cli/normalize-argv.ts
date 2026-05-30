import { AGENT_MODES } from "@code-mind/shared";

const AGENT_MODE_SET = new Set<string>(AGENT_MODES);

const TOP_LEVEL_COMMANDS = new Set([
  "run",
  "session",
  "sessions",
  "export",
  "import",
  "models",
  "providers",
  "auth",
  "config",
  "verify",
  "review",
  "capabilities",
  "mcp",
  "hooks",
  "skills",
  "skill",
  "agents",
  "agent",
  "plugin",
  "plug",
  "web",
  "serve",
  "ci",
  "debug",
  "mock",
  "interactive",
  "help",
  "version",
]);

const AGENT_SUBCOMMANDS = new Set(["create", "list"]);

function isAgentMode(value: string): boolean {
  return AGENT_MODE_SET.has(value);
}

/** Map legacy argv shapes onto the yargs command tree (OpenCode-style `run`, `session`, etc.). */
export function normalizeArgv(argv: string[]): string[] {
  if (argv[0] === "--") {
    argv = argv.slice(1);
  }

  if (argv.length === 0) {
    return argv;
  }

  const first = argv[0];
  if (first === undefined || first.startsWith("-")) {
    return argv;
  }

  if (first === "sessions") {
    return ["session", ...argv.slice(1)];
  }

  if (first === "serve") {
    return ["web", "start", ...argv.slice(1)];
  }

  if (first === "auth") {
    return ["providers", ...argv.slice(1)];
  }

  if (first === "plug") {
    return ["plugin", ...argv.slice(1)];
  }

  if (first === "agent") {
    const second = argv[1];
    if (second !== undefined && AGENT_SUBCOMMANDS.has(second)) {
      return argv;
    }
    if (second !== undefined && isAgentMode(second)) {
      return ["run", ...argv.slice(2), "--mode", second];
    }
    if (second !== undefined && !second.startsWith("-")) {
      return ["run", ...argv.slice(1), "--mode", "agent"];
    }
    return argv;
  }

  if (isAgentMode(first)) {
    return ["run", ...argv.slice(1), "--mode", first];
  }

  if (!TOP_LEVEL_COMMANDS.has(first)) {
    return ["run", ...argv];
  }

  return argv;
}
