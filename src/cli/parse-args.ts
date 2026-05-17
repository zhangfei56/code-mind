import type { RunMode } from "../shared/types.js";
import { ValidationError } from "../shared/errors.js";

export interface RunCliArgs {
  task: string;
  cwd: string;
  model?: string;
  mode: RunMode;
  maxSteps: number;
  planFirst?: boolean;
  useWorktree?: boolean;
  skill?: string;
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

export type CliArgs =
  | RunCliArgs
  | ConfigShowCliArgs
  | SessionsListCliArgs
  | SessionsShowCliArgs
  | SessionsResumeCliArgs
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
  | CiCliArgs;

const RUN_MODES: readonly RunMode[] = [
  "plan",
  "read_only",
  "suggest",
  "auto_edit",
  "full_auto",
  "sandbox_auto",
];

export function parseArgs(argv: string[]): CliArgs {
  if (argv[0] === "config" && argv[1] === "show") {
    return {
      command: "config",
      subcommand: "show",
    };
  }

  if (argv[0] === "sessions" && argv[1] === "list") {
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

  if (argv[0] === "sessions" && argv[1] === "show") {
    const sessionId = argv[2];
    if (!sessionId) {
      throw new ValidationError("Missing session id. Usage: agent sessions show <session-id> [--cwd .]");
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

  if (argv[0] === "sessions" && argv[1] === "resume") {
    const sessionId = argv[2];
    if (!sessionId) {
      throw new ValidationError("Missing session id. Usage: agent sessions resume <session-id> [--cwd .] [--model name] [--max-steps 10]");
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
      throw new ValidationError("Missing server name. Usage: agent mcp add <server>");
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
      throw new ValidationError("Missing skill name. Usage: agent skills show <name>");
    }
    return { command: "skills", subcommand: "show", cwd: process.cwd(), name };
  }

  if (argv[0] === "skill" && argv[1] === "run") {
    const name = argv[2];
    if (!name) {
      throw new ValidationError("Missing skill name. Usage: agent skill run <name> [task]");
    }
    const positional = argv.slice(3).filter((value) => !value.startsWith("--"));
    let model: string | undefined;
    let cwd = process.cwd();
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
      }
    }
    return {
      command: "skill",
      subcommand: "run",
      cwd,
      name,
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

  const positional: string[] = [];
  let cwd = process.cwd();
  let model: string | undefined;
  let mode: RunMode = "suggest";
  let maxSteps = 10;
  let planFirst = false;
  let useWorktree = false;
  let skill: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === undefined) {
      continue;
    }

    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }

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
        if (!RUN_MODES.includes(next as RunMode)) {
          throw new ValidationError(`Invalid mode: ${next}`);
        }
        mode = next as RunMode;
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
      case "--skill":
        if (!next) {
          throw new ValidationError("Missing value for --skill");
        }
        skill = next;
        index += 1;
        break;
      default:
        throw new ValidationError(`Unknown argument: ${value}`);
    }
  }

  const task = positional.join(" ").trim();
  if (!task) {
    throw new ValidationError("Missing task. Usage: agent \"<task>\" [--cwd .] [--model name] [--mode suggest] [--max-steps 10]");
  }

  return {
    task,
    cwd,
    mode,
    maxSteps,
    ...(planFirst ? { planFirst: true } : {}),
    ...(useWorktree ? { useWorktree: true } : {}),
    ...(skill === undefined ? {} : { skill }),
    ...(model === undefined ? {} : { model }),
  };
}
