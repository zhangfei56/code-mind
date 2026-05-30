import type { AgentMode, EventLevel } from "@code-mind/shared";
import { AGENT_MODES, DEFAULT_AGENT_MODE, ValidationError } from "@code-mind/shared";
import { CLI_BIN_NAME } from "./cli-name.js";

export interface RunCliArgs {
  task: string;
  cwd: string;
  model?: string;
  mode: AgentMode;
  modeExplicit: boolean;
  maxSteps: number;
  planFirst?: boolean;
  useWorktree?: boolean;
  skill?: string;
  continue?: boolean;
  sessionId?: string;
  fork?: boolean;
  promptFile?: string;
  json?: boolean;
  jsonl?: boolean;
  verbose?: boolean;
  trace?: boolean;
  debug?: boolean;
  logLevel?: EventLevel;
}

export interface InteractiveCliArgs {
  command: "interactive";
  cwd: string;
  model?: string;
  mode: AgentMode;
  maxSteps: number;
  continue?: boolean;
  sessionId?: string;
  fork?: boolean;
  logLevel?: EventLevel;
}

export interface ConfigShowCliArgs {
  command: "config";
  subcommand: "show";
}

export interface SessionsListCliArgs {
  command: "sessions";
  subcommand: "list";
  cwd: string;
}

export interface SessionsShowCliArgs {
  command: "sessions";
  subcommand: "show";
  sessionId: string;
  cwd: string;
}

export interface SessionsResumeCliArgs {
  command: "sessions";
  subcommand: "resume";
  sessionId: string;
  cwd: string;
  model?: string;
  maxSteps: number;
}

export interface SessionsRevertCliArgs {
  command: "sessions";
  subcommand: "revert";
  sessionId: string;
  cwd: string;
}

export interface SessionsExecuteCliArgs {
  command: "sessions";
  subcommand: "execute";
  planSessionId: string;
  cwd: string;
  mode?: AgentMode;
  model?: string;
  maxSteps: number;
}

export interface VerifyCliArgs {
  command: "verify";
  cwd: string;
  test?: boolean;
  lint?: boolean;
  build?: boolean;
}

export interface ReviewCliArgs {
  command: "review";
  cwd: string;
}

export interface CapabilitiesCliArgs {
  command: "capabilities";
  cwd: string;
}

export interface McpCliArgs {
  command: "mcp";
  subcommand: "list" | "add";
  cwd: string;
  serverName?: string;
}

export interface HooksCliArgs {
  command: "hooks";
  subcommand: "list";
  cwd: string;
}

export interface SkillsCliArgs {
  command: "skills";
  subcommand: "list";
  cwd: string;
}

export interface SkillShowCliArgs {
  command: "skills";
  subcommand: "show";
  cwd: string;
  name: string;
}

export interface SkillRunCliArgs {
  command: "skill";
  subcommand: "run";
  cwd: string;
  name: string;
  task?: string;
  model?: string;
  mode: AgentMode;
  modeExplicit: boolean;
}

export interface AgentsCliArgs {
  command: "agents";
  subcommand: "list";
  cwd: string;
}

export interface PluginCliArgs {
  command: "plugin";
  subcommand: "install" | "list" | "enable" | "disable" | "remove";
  cwd: string;
  target?: string;
}

export interface WebCliArgs {
  command: "web";
  subcommand: "start";
  cwd: string;
  port: number;
}

export interface CiCliArgs {
  command: "ci";
  subcommand: "review";
  cwd: string;
  output?: string;
}

export interface ModelsListCliArgs {
  command: "models";
  subcommand: "list";
  provider?: string;
}

export interface ProvidersListCliArgs {
  command: "providers";
  subcommand: "list";
}

export interface ExportCliArgs {
  command: "export";
  sessionId?: string;
  cwd: string;
}

export interface ImportCliArgs {
  command: "import";
  filePath: string;
  cwd: string;
}

export interface SessionsDeleteCliArgs {
  command: "sessions";
  subcommand: "delete";
  sessionId: string;
  cwd: string;
}

export type CliArgs =
  | InteractiveCliArgs
  | RunCliArgs
  | ConfigShowCliArgs
  | SessionsListCliArgs
  | SessionsShowCliArgs
  | SessionsResumeCliArgs
  | SessionsRevertCliArgs
  | SessionsExecuteCliArgs
  | SessionsDeleteCliArgs
  | VerifyCliArgs
  | ReviewCliArgs
  | CapabilitiesCliArgs
  | McpCliArgs
  | HooksCliArgs
  | SkillsCliArgs
  | SkillShowCliArgs
  | SkillRunCliArgs
  | AgentsCliArgs
  | PluginCliArgs
  | WebCliArgs
  | CiCliArgs
  | ModelsListCliArgs
  | ProvidersListCliArgs
  | ExportCliArgs
  | ImportCliArgs;

const AGENT_MODE_SET = new Set<string>(AGENT_MODES);

function isAgentMode(value: string): value is AgentMode {
  return AGENT_MODE_SET.has(value);
}

function isCliBootstrapLogLevel(value: string): value is Exclude<EventLevel, "trace"> {
  return value === "error" || value === "warn" || value === "info" || value === "debug";
}

function parseModeSubcommand(argv: string[]): {
  mode: AgentMode;
  taskArgv: string[];
} | null {
  const first = argv[0];
  if (first === undefined || !isAgentMode(first)) {
    return null;
  }

  const rest = argv.slice(1);
  const nextFlagIndex = rest.findIndex((value) => value.startsWith("--"));
  const positional =
    nextFlagIndex === -1 ? rest : rest.slice(0, nextFlagIndex);
  const flags = nextFlagIndex === -1 ? [] : rest.slice(nextFlagIndex);

  if (positional.length === 0) {
    throw new ValidationError(`Missing task for ${first} mode. Usage: ${CLI_BIN_NAME} ${first} "<task>"`);
  }

  return {
    mode: first,
    taskArgv: [...positional, ...flags],
  };
}

function sessionRoot(argv: string[]): boolean {
  return argv[0] === "sessions" || argv[0] === "session";
}

export function parseArgs(argv: string[]): CliArgs {
  if (argv[0] === "--") {
    argv = argv.slice(1);
  }

  let explicitRun = false;
  if (argv[0] === "run") {
    explicitRun = true;
    argv = argv.slice(1);
  }

  if (!explicitRun && (argv.length === 0 || argv[0]?.startsWith("--"))) {
    let cwd = process.cwd();
    let model: string | undefined;
    let mode: AgentMode = DEFAULT_AGENT_MODE;
    let maxSteps = 10;
    let continueSession = false;
    let sessionId: string | undefined;
    let fork = false;
    let logLevel: Exclude<EventLevel, "trace"> | undefined;

    for (let index = 0; index < argv.length; index += 1) {
      const value = argv[index];
      const next = argv[index + 1];
      switch (value) {
        case "--cwd":
          if (!next) {
            throw new ValidationError("Missing value for --cwd");
          }
          cwd = next;
          index += 1;
          break;
        case "--model":
          if (!next) {
            throw new ValidationError("Missing value for --model");
          }
          model = next;
          index += 1;
          break;
        case "--mode":
          if (!next) {
            throw new ValidationError("Missing value for --mode");
          }
          if (!isAgentMode(next)) {
            throw new ValidationError(`Invalid mode: ${next}. Expected one of: ${AGENT_MODES.join(", ")}`);
          }
          mode = next;
          index += 1;
          break;
        case "--max-steps":
          if (!next) {
            throw new ValidationError("Missing value for --max-steps");
          }
          maxSteps = Number.parseInt(next, 10);
          if (!Number.isInteger(maxSteps) || maxSteps <= 0) {
            throw new ValidationError("Expected --max-steps to be a positive integer");
          }
          index += 1;
          break;
        case "--continue":
        case "-c":
          continueSession = true;
          break;
        case "--session":
        case "-s":
          if (!next) {
            throw new ValidationError("Missing value for --session");
          }
          sessionId = next;
          index += 1;
          break;
        case "--fork":
          fork = true;
          break;
        case "--log-level":
          if (!next || !isCliBootstrapLogLevel(next)) {
            throw new ValidationError("Invalid --log-level. Expected one of: error, warn, info, debug");
          }
          logLevel = next;
          index += 1;
          break;
        default:
          throw new ValidationError(`Unknown argument: ${value}`);
      }
    }

    return {
      command: "interactive",
      cwd,
      mode,
      maxSteps,
      ...(model === undefined ? {} : { model }),
      ...(continueSession ? { continue: true } : {}),
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(fork ? { fork: true } : {}),
      ...(logLevel === undefined ? {} : { logLevel }),
    };
  }

  if (argv[0] === "config" && argv[1] === "show") {
    return {
      command: "config",
      subcommand: "show",
    };
  }

  if (argv[0] === "models" && (argv[1] === "list" || argv[1] === undefined)) {
    const provider = argv[2]?.startsWith("--") ? undefined : argv[2];
    return {
      command: "models",
      subcommand: "list",
      ...(provider === undefined ? {} : { provider }),
    };
  }

  if (
    (argv[0] === "providers" || argv[0] === "auth") &&
    (argv[1] === "list" || argv[1] === undefined)
  ) {
    return { command: "providers", subcommand: "list" };
  }

  if (argv[0] === "export") {
    let cwd = process.cwd();
    let sessionId = argv[1]?.startsWith("--") ? undefined : argv[1];
    for (let index = 1; index < argv.length; index += 1) {
      const value = argv[index];
      const next = argv[index + 1];
      if (value === "--cwd") {
        if (!next) {
          throw new ValidationError("Missing value for --cwd");
        }
        cwd = next;
        index += 1;
        continue;
      }
      if (value === "--session" || value === "-s") {
        if (!next) {
          throw new ValidationError("Missing value for --session");
        }
        sessionId = next;
        index += 1;
      }
    }
    return {
      command: "export",
      cwd,
      ...(sessionId === undefined ? {} : { sessionId }),
    };
  }

  if (argv[0] === "import") {
    const filePath = argv[1];
    if (!filePath || filePath.startsWith("--")) {
      throw new ValidationError(`Missing file path. Usage: ${CLI_BIN_NAME} import <file.json> [--cwd .]`);
    }
    let cwd = process.cwd();
    for (let index = 2; index < argv.length; index += 1) {
      const value = argv[index];
      const next = argv[index + 1];
      if (value === "--cwd") {
        if (!next) {
          throw new ValidationError("Missing value for --cwd");
        }
        cwd = next;
        index += 1;
        continue;
      }
      throw new ValidationError(`Unknown argument: ${value}`);
    }
    return { command: "import", filePath, cwd };
  }

  if (sessionRoot(argv) && argv[1] === "list") {
    let cwd = process.cwd();
    for (let index = 2; index < argv.length; index += 1) {
      const value = argv[index];
      if (value === "--cwd") {
        const next = argv[index + 1];
        if (!next) {
          throw new ValidationError("Missing value for --cwd");
        }
        cwd = next;
        index += 1;
        continue;
      }

      throw new ValidationError(`Unknown argument: ${value}`);
    }

    return {
      command: "sessions",
      subcommand: "list",
      cwd,
    };
  }

  if (sessionRoot(argv) && argv[1] === "show") {
    const sessionId = argv[2];
    if (!sessionId) {
      throw new ValidationError(`Missing session id. Usage: ${CLI_BIN_NAME} sessions show <session-id> [--cwd .]`);
    }

    let cwd = process.cwd();
    for (let index = 3; index < argv.length; index += 1) {
      const value = argv[index];
      if (value === "--cwd") {
        const next = argv[index + 1];
        if (!next) {
          throw new ValidationError("Missing value for --cwd");
        }
        cwd = next;
        index += 1;
        continue;
      }

      throw new ValidationError(`Unknown argument: ${value}`);
    }

    return {
      command: "sessions",
      subcommand: "show",
      sessionId,
      cwd,
    };
  }

  if (sessionRoot(argv) && argv[1] === "revert") {
    const sessionId = argv[2];
    if (!sessionId) {
      throw new ValidationError(
        `Missing session id. Usage: ${CLI_BIN_NAME} sessions revert <session-id> [--cwd .]`,
      );
    }

    let cwd = process.cwd();
    for (let index = 3; index < argv.length; index += 1) {
      const value = argv[index];
      if (value === "--cwd") {
        const next = argv[index + 1];
        if (!next) {
          throw new ValidationError("Missing value for --cwd");
        }
        cwd = next;
        index += 1;
        continue;
      }

      throw new ValidationError(`Unknown argument: ${value}`);
    }

    return {
      command: "sessions",
      subcommand: "revert",
      sessionId,
      cwd,
    };
  }

  if (sessionRoot(argv) && argv[1] === "delete") {
    const sessionId = argv[2];
    if (!sessionId) {
      throw new ValidationError(`Missing session id. Usage: ${CLI_BIN_NAME} session delete <session-id> [--cwd .]`);
    }
    let cwd = process.cwd();
    for (let index = 3; index < argv.length; index += 1) {
      const value = argv[index];
      if (value === "--cwd") {
        const next = argv[index + 1];
        if (!next) {
          throw new ValidationError("Missing value for --cwd");
        }
        cwd = next;
        index += 1;
        continue;
      }
      throw new ValidationError(`Unknown argument: ${value}`);
    }
    return {
      command: "sessions",
      subcommand: "delete",
      sessionId,
      cwd,
    };
  }

  if (sessionRoot(argv) && argv[1] === "execute") {
    const planSessionId = argv[2];
    if (!planSessionId) {
      throw new ValidationError(
        `Missing plan session id. Usage: ${CLI_BIN_NAME} sessions execute <plan-session-id> [--mode edit|agent] [--cwd .] [--model name] [--max-steps 10]`,
      );
    }

    let cwd = process.cwd();
    let mode: AgentMode | undefined;
    let model: string | undefined;
    let maxSteps = 10;

    for (let index = 3; index < argv.length; index += 1) {
      const value = argv[index];
      const next = argv[index + 1];

      switch (value) {
        case "--cwd":
          if (!next) {
            throw new ValidationError("Missing value for --cwd");
          }
          cwd = next;
          index += 1;
          break;
        case "--mode":
          if (!next || !isAgentMode(next)) {
            throw new ValidationError(
              `Invalid --mode. Expected one of: ${AGENT_MODES.join(", ")}`,
            );
          }
          mode = next;
          index += 1;
          break;
        case "--model":
          if (!next) {
            throw new ValidationError("Missing value for --model");
          }
          model = next;
          index += 1;
          break;
        case "--max-steps":
          if (!next) {
            throw new ValidationError("Missing value for --max-steps");
          }
          maxSteps = Number(next);
          if (!Number.isFinite(maxSteps) || maxSteps <= 0) {
            throw new ValidationError("Invalid --max-steps value.");
          }
          index += 1;
          break;
        default:
          throw new ValidationError(`Unknown argument: ${value}`);
      }
    }

    return {
      command: "sessions",
      subcommand: "execute",
      planSessionId,
      cwd,
      ...(mode === undefined ? {} : { mode }),
      ...(model === undefined ? {} : { model }),
      maxSteps,
    };
  }

  if (sessionRoot(argv) && argv[1] === "resume") {
    const sessionId = argv[2];
    if (!sessionId) {
      throw new ValidationError(`Missing session id. Usage: ${CLI_BIN_NAME} sessions resume <session-id> [--cwd .] [--model name] [--max-steps 10]`);
    }

    let cwd = process.cwd();
    let model: string | undefined;
    let maxSteps = 10;

    for (let index = 3; index < argv.length; index += 1) {
      const value = argv[index];
      const next = argv[index + 1];

      switch (value) {
        case "--cwd":
          if (!next) {
            throw new ValidationError("Missing value for --cwd");
          }
          cwd = next;
          index += 1;
          break;
        case "--model":
          if (!next) {
            throw new ValidationError("Missing value for --model");
          }
          model = next;
          index += 1;
          break;
        case "--max-steps":
          if (!next) {
            throw new ValidationError("Missing value for --max-steps");
          }
          maxSteps = Number.parseInt(next, 10);
          if (!Number.isInteger(maxSteps) || maxSteps <= 0) {
            throw new ValidationError("Expected --max-steps to be a positive integer");
          }
          index += 1;
          break;
        default:
          throw new ValidationError(`Unknown argument: ${value}`);
      }
    }

    return {
      command: "sessions",
      subcommand: "resume",
      sessionId,
      cwd,
      maxSteps,
      ...(model === undefined ? {} : { model }),
    };
  }

  if (argv[0] === "verify") {
    let cwd = process.cwd();
    let test = false;
    let lint = false;
    let build = false;

    for (let index = 1; index < argv.length; index += 1) {
      const value = argv[index];
      const next = argv[index + 1];
      switch (value) {
        case "--cwd":
          if (!next) {
            throw new ValidationError("Missing value for --cwd");
          }
          cwd = next;
          index += 1;
          break;
        case "--test":
          test = true;
          break;
        case "--lint":
          lint = true;
          break;
        case "--build":
          build = true;
          break;
        default:
          throw new ValidationError(`Unknown argument: ${value}`);
      }
    }

    return {
      command: "verify",
      cwd,
      ...(test ? { test: true } : {}),
      ...(lint ? { lint: true } : {}),
      ...(build ? { build: true } : {}),
    };
  }

  if (argv[0] === "review") {
    let cwd = process.cwd();
    for (let index = 1; index < argv.length; index += 1) {
      const value = argv[index];
      const next = argv[index + 1];
      switch (value) {
        case "--cwd":
          if (!next) {
            throw new ValidationError("Missing value for --cwd");
          }
          cwd = next;
          index += 1;
          break;
        default:
          throw new ValidationError(`Unknown argument: ${value}`);
      }
    }

    return {
      command: "review",
      cwd,
    };
  }

  if (argv[0] === "capabilities") {
    return {
      command: "capabilities",
      cwd: process.cwd(),
    };
  }

  if (argv[0] === "mcp" && (argv[1] === "list" || argv[1] === "add")) {
    const subcommand = argv[1];
    let cwd = process.cwd();
    const serverName = subcommand === "add" ? argv[2] : undefined;
    if (subcommand === "add" && !serverName) {
      throw new ValidationError(`Missing server name. Usage: ${CLI_BIN_NAME} mcp add <server>`);
    }
    for (let index = subcommand === "add" ? 3 : 2; index < argv.length; index += 1) {
      const value = argv[index];
      const next = argv[index + 1];
      if (value === "--cwd") {
        if (!next) {
          throw new ValidationError("Missing value for --cwd");
        }
        cwd = next;
        index += 1;
        continue;
      }
      throw new ValidationError(`Unknown argument: ${value}`);
    }
    return {
      command: "mcp",
      subcommand,
      cwd,
      ...(serverName === undefined ? {} : { serverName }),
    };
  }

  if (argv[0] === "hooks" && argv[1] === "list") {
    return { command: "hooks", subcommand: "list", cwd: process.cwd() };
  }

  if (argv[0] === "skills" && argv[1] === "list") {
    return { command: "skills", subcommand: "list", cwd: process.cwd() };
  }

  if (argv[0] === "skills" && argv[1] === "show") {
    const name = argv[2];
    if (!name) {
      throw new ValidationError(`Missing skill name. Usage: ${CLI_BIN_NAME} skills show <name>`);
    }
    return { command: "skills", subcommand: "show", cwd: process.cwd(), name };
  }

  if (argv[0] === "skill" && argv[1] === "run") {
    const name = argv[2];
    if (!name) {
      throw new ValidationError(`Missing skill name. Usage: ${CLI_BIN_NAME} skill run <name> [task]`);
    }
    const positional = argv.slice(3).filter((value) => !value.startsWith("--"));
    let model: string | undefined;
    let cwd = process.cwd();
    let mode: AgentMode = DEFAULT_AGENT_MODE;
    let modeExplicit = false;
    for (let index = 3; index < argv.length; index += 1) {
      const value = argv[index];
      const next = argv[index + 1];
      switch (value) {
        case "--cwd":
          if (!next) {
            throw new ValidationError("Missing value for --cwd");
          }
          cwd = next;
          index += 1;
          break;
        case "--model":
          if (!next) {
            throw new ValidationError("Missing value for --model");
          }
          model = next;
          index += 1;
          break;
        case "--mode":
          if (!next) {
            throw new ValidationError("Missing value for --mode");
          }
          if (!isAgentMode(next)) {
            throw new ValidationError(
              `Invalid mode: ${next}. Expected one of: ${AGENT_MODES.join(", ")}`,
            );
          }
          mode = next;
          modeExplicit = true;
          index += 1;
          break;
      }
    }
    return {
      command: "skill",
      subcommand: "run",
      cwd,
      name,
      mode,
      modeExplicit,
      ...(positional.length === 0 ? {} : { task: positional.join(" ") }),
      ...(model === undefined ? {} : { model }),
    };
  }

  if (argv[0] === "agents" && argv[1] === "list") {
    return { command: "agents", subcommand: "list", cwd: process.cwd() };
  }

  if (
    argv[0] === "plugin" &&
    ["install", "list", "enable", "disable", "remove"].includes(argv[1] ?? "")
  ) {
    const subcommand = argv[1] as PluginCliArgs["subcommand"];
    const target = subcommand === "list" ? undefined : argv[2];
    if (subcommand !== "list" && !target) {
      throw new ValidationError(`Missing target for plugin ${subcommand}.`);
    }
    return {
      command: "plugin",
      subcommand,
      cwd: process.cwd(),
      ...(target === undefined ? {} : { target }),
    };
  }

  if (argv[0] === "serve") {
    argv = ["web", "start", ...argv.slice(1)];
  }

  if (argv[0] === "web" && argv[1] === "start") {
    let cwd = process.cwd();
    let port = 3000;
    for (let index = 2; index < argv.length; index += 1) {
      const value = argv[index];
      const next = argv[index + 1];
      switch (value) {
        case "--cwd":
          if (!next) {
            throw new ValidationError("Missing value for --cwd");
          }
          cwd = next;
          index += 1;
          break;
        case "--port":
          if (!next) {
            throw new ValidationError("Missing value for --port");
          }
          port = Number.parseInt(next, 10);
          index += 1;
          break;
        default:
          throw new ValidationError(`Unknown argument: ${value}`);
      }
    }
    return { command: "web", subcommand: "start", cwd, port };
  }

  if (argv[0] === "ci" && argv[1] === "review") {
    let cwd = process.cwd();
    let output: string | undefined;
    for (let index = 2; index < argv.length; index += 1) {
      const value = argv[index];
      const next = argv[index + 1];
      switch (value) {
        case "--cwd":
          if (!next) {
            throw new ValidationError("Missing value for --cwd");
          }
          cwd = next;
          index += 1;
          break;
        case "--output":
          if (!next) {
            throw new ValidationError("Missing value for --output");
          }
          output = next;
          index += 1;
          break;
        default:
          throw new ValidationError(`Unknown argument: ${value}`);
      }
    }
    return {
      command: "ci",
      subcommand: "review",
      cwd,
      ...(output === undefined ? {} : { output }),
    };
  }

  const modeSubcommand = parseModeSubcommand(argv);
  const runArgv = modeSubcommand?.taskArgv ?? argv;
  const presetMode = modeSubcommand?.mode;

  const positional: string[] = [];
  let cwd = process.cwd();
  let model: string | undefined;
  let mode: AgentMode = presetMode ?? DEFAULT_AGENT_MODE;
  let modeExplicit = presetMode !== undefined;
  let maxSteps = 10;
  let planFirst = false;
  let useWorktree = false;
  let skill: string | undefined;
  let autoApprove = false;
  let continueSession = false;
  let sessionId: string | undefined;
  let fork = false;
  let promptFile: string | undefined;
  let json = false;
  let jsonl = false;
  let verbose = false;
  let trace = false;
  let logLevel: Exclude<EventLevel, "trace"> | undefined;

  for (let index = 0; index < runArgv.length; index += 1) {
    const value = runArgv[index];
    if (value === undefined) {
      continue;
    }

    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }

    const next = runArgv[index + 1];

    switch (value) {
      case "--cwd":
        if (!next) {
          throw new ValidationError("Missing value for --cwd");
        }
        cwd = next;
        index += 1;
        break;
      case "--model":
        if (!next) {
          throw new ValidationError("Missing value for --model");
        }
        model = next;
        index += 1;
        break;
      case "--mode":
        if (!next) {
          throw new ValidationError("Missing value for --mode");
        }
        if (!isAgentMode(next)) {
          throw new ValidationError(`Invalid mode: ${next}. Expected one of: ${AGENT_MODES.join(", ")}`);
        }
        mode = next;
        modeExplicit = true;
        index += 1;
        break;
      case "--max-steps":
        if (!next) {
          throw new ValidationError("Missing value for --max-steps");
        }
        maxSteps = Number.parseInt(next, 10);
        if (!Number.isInteger(maxSteps) || maxSteps <= 0) {
          throw new ValidationError("Expected --max-steps to be a positive integer");
        }
        index += 1;
        break;
      case "--plan":
        planFirst = true;
        break;
      case "--worktree":
        useWorktree = true;
        break;
      case "--auto":
        autoApprove = true;
        break;
      case "--skill":
        if (!next) {
          throw new ValidationError("Missing value for --skill");
        }
        skill = next;
        index += 1;
        break;
      case "--continue":
      case "-c":
        continueSession = true;
        break;
      case "--session":
      case "-s":
        if (!next) {
          throw new ValidationError("Missing value for --session");
        }
        sessionId = next;
        index += 1;
        break;
      case "--fork":
        fork = true;
        break;
      case "--file":
      case "-f":
        if (!next) {
          throw new ValidationError("Missing value for --file");
        }
        promptFile = next;
        index += 1;
        break;
      case "--prompt-file":
        if (!next) {
          throw new ValidationError("Missing value for --prompt-file");
        }
        promptFile = next;
        index += 1;
        break;
      case "--json":
        json = true;
        break;
      case "--jsonl":
        jsonl = true;
        break;
      case "--verbose":
        verbose = true;
        break;
      case "--trace":
        trace = true;
        break;
      case "--log-level":
        if (!next || !isCliBootstrapLogLevel(next)) {
          throw new ValidationError("Invalid --log-level. Expected one of: error, warn, info, debug");
        }
        logLevel = next;
        index += 1;
        break;
      default:
        throw new ValidationError(`Unknown argument: ${value}`);
    }
  }

  if (autoApprove && mode === "edit") {
    mode = "agent";
  }

  const task = positional.join(" ").trim();
  if (!task && !continueSession && !sessionId && !promptFile) {
    throw new ValidationError(
      `Missing task. Usage: ${CLI_BIN_NAME} "<task>" [--mode ${AGENT_MODES.join("|")}] or ${CLI_BIN_NAME} <mode> "<task>"`,
    );
  }

  return {
    task,
    cwd,
    mode,
    modeExplicit,
    maxSteps,
    ...(planFirst ? { planFirst: true } : {}),
    ...(useWorktree ? { useWorktree: true } : {}),
    ...(skill === undefined ? {} : { skill }),
    ...(model === undefined ? {} : { model }),
    ...(continueSession ? { continue: true } : {}),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(fork ? { fork: true } : {}),
    ...(promptFile === undefined ? {} : { promptFile }),
    ...(json ? { json: true } : {}),
    ...(jsonl ? { jsonl: true } : {}),
    ...(verbose ? { verbose: true } : {}),
    ...(trace ? { trace: true } : {}),
    ...(logLevel === undefined ? {} : { logLevel }),
  };
}
