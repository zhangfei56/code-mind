import yargs from "yargs";
import { AGENT_MODES, ValidationError } from "@code-mind/shared";
import { CLI_BIN_NAME } from "./cli-name.js";
import { printCliLogo } from "./cli-logo.js";
import { executeCliArgs, executeDebugInfo, writeSessionListJson } from "../commands/execute-cli-args.js";
import { normalizeArgv } from "./normalize-argv.js";
import {
  coerceCwd,
  coerceRunOptions,
  getModeOverride,
  hasExplicitModeOption,
  runOptionsToCliArgs,
  withCwdOption,
  withRunOptions,
} from "./common-options.js";
import { renderConfig } from "../commands/config.js";
import { executeMockList, executeMockRun } from "../commands/mock-run.js";
import { resolveMockScenario } from "../mock/index.js";
import { getLoadedConfig, renderModelsList, renderProvidersList } from "../commands/models.js";
import { loadConfig } from "@code-mind/config";
import { resolveWorkspace } from "@code-mind/workspace";
import { resolve } from "node:path";
import { startTuiPreview, startTuiShell } from "../tui/app.js";

const VERSION = "0.1.0";

type YargsArgs = Record<string, unknown>;

async function runHandler(
  task: string,
  options: YargsArgs,
  argv: readonly string[],
): Promise<void> {
  const run = coerceRunOptions(options);
  const modeExplicit = hasExplicitModeOption(argv);
  process.exitCode = await executeCliArgs(
    runOptionsToCliArgs(task, { ...run, modeExplicit }),
  );
}

export function buildCli(argv: string[]) {
  const normalizedArgv = normalizeArgv(argv);
  return yargs(normalizedArgv)
    .scriptName(CLI_BIN_NAME)
    .usage(`Usage: ${CLI_BIN_NAME} [command] [options]`)
    .version(VERSION)
    .alias("version", "v")
    .help()
    .alias("help", "h")
    .wrap(Math.min(100, process.stdout.columns ?? 100))
    .strict()
    .demandCommand(0, 0)
    .command(
      "$0",
      "Start interactive REPL (OpenCode-style default)",
      (yargsBuilder) => withRunOptions(yargsBuilder).example("$0", "Start interactive mode"),
      async (options: YargsArgs) => {
        const run = coerceRunOptions(options);
        if (run.tui) {
          process.exitCode = await startTuiShell({
            cwd: run.cwd,
            mode: run.mode as (typeof AGENT_MODES)[number],
            maxSteps: run.maxSteps,
            ...(run.model === undefined ? {} : { model: run.model }),
            ...(run.sessionId === undefined ? {} : { initialSessionId: run.sessionId }),
          });
          return;
        }
        process.exitCode = await executeCliArgs({
          command: "interactive",
          cwd: run.cwd,
          mode: run.mode as (typeof AGENT_MODES)[number],
          maxSteps: run.maxSteps,
          ...(run.model === undefined ? {} : { model: run.model }),
          ...(run.continue ? { continue: true } : {}),
          ...(run.sessionId === undefined ? {} : { sessionId: run.sessionId }),
          ...(run.fork ? { fork: true } : {}),
        });
      },
    )
    .command(
      "run [task]",
      "Run a task non-interactively (OpenCode-compatible)",
      (yargsBuilder) =>
        withRunOptions(yargsBuilder)
          .positional("task", {
            type: "string",
            describe: "Task description (optional with --continue or --file)",
          })
          .example('$0 run "fix failing tests" --cwd .', "Run edit-mode task"),
      async (options: YargsArgs) => {
        const run = coerceRunOptions(options);
        if (run.tui) {
          process.exitCode = await startTuiShell({
            cwd: run.cwd,
            mode: run.mode as (typeof AGENT_MODES)[number],
            maxSteps: run.maxSteps,
            initialTask: String(options.task ?? ""),
            ...(run.model === undefined ? {} : { model: run.model }),
            ...(run.sessionId === undefined ? {} : { initialSessionId: run.sessionId }),
          });
          return;
        }
        await runHandler(String(options.task ?? ""), options, normalizedArgv);
      },
    )
    .command(
      "mock",
      "Replay mock agent runs to preview CLI UI (no model, no API key)",
      (yargsBuilder) =>
        yargsBuilder
          .command(
            "list",
            "List available mock scenarios",
            (builder) => builder,
            async () => {
              process.exitCode = await executeMockList();
            },
          )
          .command(
            "run [task]",
            "Replay a mock run through the real CLI printer",
            (builder) =>
              withRunOptions(builder)
                .positional("task", {
                  type: "string",
                  describe: "Task label shown in header (optional)",
                })
                .option("scenario", {
                  type: "string",
                  default: "explain-repo",
                  describe: "Mock scenario id (explain-repo | shell-failure | approval)",
                })
                .option("delay", {
                  type: "number",
                  default: 0,
                  describe: "Milliseconds between events (TTY spinner demo)",
                })
                .example('$0 mock run "explain this repo"', "Default L0 quiet UI")
                .example("$0 mock run --verbose --scenario explain-repo", "Verbose step log")
                .example("$0 mock run --scenario approval", "Approval prompt UI")
                .example("$0 mock run --delay 250", "Slow replay for spinner preview"),
            async (options: YargsArgs) => {
              const run = coerceRunOptions(options);
              if (run.tui) {
                const scenario = resolveMockScenario({
                  scenarioId: String(options.scenario ?? "explain-repo"),
                  task: String(options.task ?? ""),
                  cwd: run.cwd,
                  mode: run.mode as (typeof AGENT_MODES)[number],
                });
                process.exitCode = await startTuiPreview({
                  cwd: scenario.cwd,
                  mode: scenario.mode,
                  model: scenario.result.modelName,
                  taskText: scenario.taskText,
                  events: scenario.events,
                  delayMs: Number(options.delay ?? 250),
                });
                return;
              }
              const modeExplicit = hasExplicitModeOption(normalizedArgv);
              process.exitCode = await executeMockRun({
                scenarioId: String(options.scenario ?? "explain-repo"),
                run: runOptionsToCliArgs(String(options.task ?? ""), {
                  ...run,
                  modeExplicit,
                }),
                delayMs: Number(options.delay ?? 0),
              });
            },
          )
          .demandCommand(1),
    )
    .command(
      "session",
      "Manage sessions (alias: sessions)",
      (yargsBuilder) =>
        yargsBuilder
          .command(
            "list",
            "List sessions",
            (builder) =>
              withCwdOption(builder).option("format", {
                choices: ["table", "json"] as const,
                default: "table" as const,
              }),
            async (options: YargsArgs) => {
              const cwd = coerceCwd(options);
              const workspaceRoot = resolveWorkspace(resolve(cwd));
              if (options.format === "json") {
                process.exitCode = await writeSessionListJson(workspaceRoot);
                return;
              }
              process.exitCode = await executeCliArgs({
                command: "sessions",
                subcommand: "list",
                cwd,
              });
            },
          )
          .command(
            "show <sessionId>",
            "Show session details",
            (builder) =>
              withCwdOption(builder).positional("sessionId", {
                type: "string",
                demandOption: true,
              }),
            async (options: YargsArgs) => {
              process.exitCode = await executeCliArgs({
                command: "sessions",
                subcommand: "show",
                sessionId: String(options.sessionId),
                cwd: coerceCwd(options),
              });
            },
          )
          .command(
            "delete <sessionId>",
            "Delete a session",
            (builder) =>
              withCwdOption(builder).positional("sessionId", {
                type: "string",
                demandOption: true,
              }),
            async (options: YargsArgs) => {
              process.exitCode = await executeCliArgs({
                command: "sessions",
                subcommand: "delete",
                sessionId: String(options.sessionId),
                cwd: coerceCwd(options),
              });
            },
          )
          .command(
            "resume <sessionId>",
            "Resume a session",
            (builder) =>
              withRunOptions(withCwdOption(builder)).positional("sessionId", {
                type: "string",
                demandOption: true,
              }),
            async (options: YargsArgs) => {
              const run = coerceRunOptions(options);
              process.exitCode = await executeCliArgs({
                command: "sessions",
                subcommand: "resume",
                sessionId: String(options.sessionId),
                cwd: run.cwd,
                maxSteps: run.maxSteps,
                ...(run.model === undefined ? {} : { model: run.model }),
              });
            },
          )
          .command(
            "revert <sessionId>",
            "Revert session file changes",
            (builder) =>
              withCwdOption(builder).positional("sessionId", {
                type: "string",
                demandOption: true,
              }),
            async (options: YargsArgs) => {
              process.exitCode = await executeCliArgs({
                command: "sessions",
                subcommand: "revert",
                sessionId: String(options.sessionId),
                cwd: coerceCwd(options),
              });
            },
          )
          .command(
            "execute <planSessionId>",
            "Execute from an approved plan session",
            (builder) =>
              withRunOptions(withCwdOption(builder)).positional("planSessionId", {
                type: "string",
                demandOption: true,
              }),
            async (options: YargsArgs) => {
              const run = coerceRunOptions(options);
              const modeOverride = getModeOverride(run, hasExplicitModeOption(normalizedArgv));
              process.exitCode = await executeCliArgs({
                command: "sessions",
                subcommand: "execute",
                planSessionId: String(options.planSessionId),
                cwd: run.cwd,
                maxSteps: run.maxSteps,
                ...(modeOverride === undefined ? {} : { mode: modeOverride }),
                ...(run.model === undefined ? {} : { model: run.model }),
              });
            },
          )
          .demandCommand(1, "Choose a session subcommand: list, show, delete, resume, revert, execute"),
    )
    .command(
      "runs",
      "Inspect run logs",
      (yargsBuilder) =>
        yargsBuilder
          .command(
            "list",
            "List runs",
            (builder) => withCwdOption(builder),
            async (options: YargsArgs) => {
              const { executeRunsList } = await import("../commands/runs.js");
              process.exitCode = await executeRunsList(coerceCwd(options));
            },
          )
          .command(
            "show <runId>",
            "Show run manifest and summary",
            (builder) =>
              withCwdOption(builder).positional("runId", {
                type: "string",
                demandOption: true,
              }),
            async (options: YargsArgs) => {
              const { executeRunShow } = await import("../commands/runs.js");
              process.exitCode = await executeRunShow(
                coerceCwd(options),
                String(options.runId),
              );
            },
          )
          .demandCommand(1),
    )
    .command(
      "export [sessionId]",
      "Export a session as JSON",
      (builder) => withCwdOption(builder),
      async (options: YargsArgs) => {
        process.exitCode = await executeCliArgs({
          command: "export",
          cwd: coerceCwd(options),
          ...(typeof options.sessionId === "string" ? { sessionId: options.sessionId } : {}),
        });
      },
    )
    .command(
      "import <file>",
      "Import a session from JSON",
      (builder) =>
        withCwdOption(builder).positional("file", {
          type: "string",
          demandOption: true,
        }),
      async (options: YargsArgs) => {
        process.exitCode = await executeCliArgs({
          command: "import",
          filePath: String(options.file),
          cwd: coerceCwd(options),
        });
      },
    )
    .command(
      "models [provider]",
      "List configured models",
      (builder) => builder,
      async (options: YargsArgs) => {
        const provider = typeof options.provider === "string" ? options.provider : undefined;
        console.log(renderModelsList(getLoadedConfig(), provider));
        process.exitCode = 0;
      },
    )
    .command(
      ["providers", "auth"],
      "Provider configuration",
      (yargsBuilder) =>
        yargsBuilder
          .command(
            "list",
            "List configured providers",
            (builder) => builder,
            async () => {
              console.log(renderProvidersList(getLoadedConfig()));
              process.exitCode = 0;
            },
          )
          .demandCommand(1, "Choose a providers subcommand: list"),
    )
    .command(
      "config",
      "Configuration",
      (yargsBuilder) =>
        yargsBuilder.command(
          "show",
          "Show loaded config",
          (builder) => builder,
          async () => {
            console.log(renderConfig(loadConfig()));
            process.exitCode = 0;
          },
        ),
    )
    .command(
      "verify",
      "Run verification pipeline",
      (builder) =>
        withCwdOption(builder)
          .option("test", { type: "boolean", default: false })
          .option("lint", { type: "boolean", default: false })
          .option("build", { type: "boolean", default: false }),
      async (options: YargsArgs) => {
        process.exitCode = await executeCliArgs({
          command: "verify",
          cwd: coerceCwd(options),
          ...(options.test ? { test: true } : {}),
          ...(options.lint ? { lint: true } : {}),
          ...(options.build ? { build: true } : {}),
        });
      },
    )
    .command("review", "Review current git diff", (builder) => withCwdOption(builder), async (options: YargsArgs) => {
      process.exitCode = await executeCliArgs({ command: "review", cwd: coerceCwd(options) });
    })
    .command("capabilities", "Show tools and models", (builder) => withCwdOption(builder), async (options: YargsArgs) => {
      process.exitCode = await executeCliArgs({ command: "capabilities", cwd: coerceCwd(options) });
    })
    .command(
      "mcp",
      "Manage MCP servers",
      (yargsBuilder) =>
        yargsBuilder
          .command("list", "List MCP servers", (builder) => withCwdOption(builder), async (options: YargsArgs) => {
            process.exitCode = await executeCliArgs({
              command: "mcp",
              subcommand: "list",
              cwd: coerceCwd(options),
            });
          })
          .command(
            "add <server>",
            "Add MCP server preset",
            (builder) =>
              withCwdOption(builder).positional("server", {
                type: "string",
                demandOption: true,
              }),
            async (options: YargsArgs) => {
              process.exitCode = await executeCliArgs({
                command: "mcp",
                subcommand: "add",
                cwd: coerceCwd(options),
                serverName: String(options.server),
              });
            },
          )
          .demandCommand(1),
    )
    .command("hooks list", "List hooks", (builder) => withCwdOption(builder), async (options: YargsArgs) => {
      process.exitCode = await executeCliArgs({
        command: "hooks",
        subcommand: "list",
        cwd: coerceCwd(options),
      });
    })
    .command(
      "skills",
      "Skill discovery",
      (yargsBuilder) =>
        yargsBuilder
          .command("list", "List skills", (builder) => withCwdOption(builder), async (options: YargsArgs) => {
            process.exitCode = await executeCliArgs({
              command: "skills",
              subcommand: "list",
              cwd: coerceCwd(options),
            });
          })
          .command(
            "show <name>",
            "Show skill content",
            (builder) =>
              withCwdOption(builder).positional("name", {
                type: "string",
                demandOption: true,
              }),
            async (options: YargsArgs) => {
              process.exitCode = await executeCliArgs({
                command: "skills",
                subcommand: "show",
                cwd: coerceCwd(options),
                name: String(options.name),
              });
            },
          )
          .demandCommand(1),
    )
    .command(
      "skill run <name> [task]",
      "Run agent with a skill",
      (builder) =>
        withRunOptions(builder)
          .positional("name", { type: "string", demandOption: true })
          .positional("task", { type: "string" }),
      async (options: YargsArgs) => {
        const run = coerceRunOptions(options);
        const modeExplicit = hasExplicitModeOption(normalizedArgv);
        const mode = runOptionsToCliArgs(String(options.task ?? ""), {
          ...run,
          modeExplicit,
        }).mode;
        process.exitCode = await executeCliArgs({
          command: "skill",
          subcommand: "run",
          cwd: run.cwd,
          name: String(options.name),
          mode,
          modeExplicit,
          ...(options.task === undefined ? {} : { task: String(options.task) }),
          ...(run.model === undefined ? {} : { model: run.model }),
        });
      },
    )
    .command(
      "agent",
      "Manage agents",
      (yargsBuilder) =>
        yargsBuilder
          .command("list", "List subagents", (builder) => withCwdOption(builder), async (options: YargsArgs) => {
            process.exitCode = await executeCliArgs({
              command: "agents",
              subcommand: "list",
              cwd: coerceCwd(options),
            });
          })
          .demandCommand(1),
    )
    .command(
      ["plugin", "plug"],
      "Plugin management",
      (yargsBuilder) =>
        yargsBuilder
          .command("list", "List plugins", (builder) => withCwdOption(builder), async (options: YargsArgs) => {
            process.exitCode = await executeCliArgs({
              command: "plugin",
              subcommand: "list",
              cwd: coerceCwd(options),
            });
          })
          .command(
            "install <target>",
            "Install plugin",
            (builder) =>
              withCwdOption(builder).positional("target", {
                type: "string",
                demandOption: true,
              }),
            async (options: YargsArgs) => {
              process.exitCode = await executeCliArgs({
                command: "plugin",
                subcommand: "install",
                cwd: coerceCwd(options),
                target: String(options.target),
              });
            },
          )
          .command(
            "enable <target>",
            "Enable plugin",
            (builder) =>
              withCwdOption(builder).positional("target", {
                type: "string",
                demandOption: true,
              }),
            async (options: YargsArgs) => {
              process.exitCode = await executeCliArgs({
                command: "plugin",
                subcommand: "enable",
                cwd: coerceCwd(options),
                target: String(options.target),
              });
            },
          )
          .command(
            "disable <target>",
            "Disable plugin",
            (builder) =>
              withCwdOption(builder).positional("target", {
                type: "string",
                demandOption: true,
              }),
            async (options: YargsArgs) => {
              process.exitCode = await executeCliArgs({
                command: "plugin",
                subcommand: "disable",
                cwd: coerceCwd(options),
                target: String(options.target),
              });
            },
          )
          .command(
            "remove <target>",
            "Remove plugin",
            (builder) =>
              withCwdOption(builder).positional("target", {
                type: "string",
                demandOption: true,
              }),
            async (options: YargsArgs) => {
              process.exitCode = await executeCliArgs({
                command: "plugin",
                subcommand: "remove",
                cwd: coerceCwd(options),
                target: String(options.target),
              });
            },
          )
          .demandCommand(1),
    )
    .command(
      "web start",
      "Start HTTP API and web UI",
      (builder) =>
        withCwdOption(builder).option("port", {
          type: "number",
          default: 3000,
        }),
      async (options: YargsArgs) => {
        process.exitCode = await executeCliArgs({
          command: "web",
          subcommand: "start",
          cwd: coerceCwd(options),
          port: Number(options.port ?? 3000),
        });
      },
    )
    .command(
      "serve",
      "Start headless HTTP server (alias for web start)",
      (builder) =>
        withCwdOption(builder).option("port", {
          type: "number",
          default: 3000,
        }),
      async (options: YargsArgs) => {
        process.exitCode = await executeCliArgs({
          command: "web",
          subcommand: "start",
          cwd: coerceCwd(options),
          port: Number(options.port ?? 3000),
        });
      },
    )
    .command(
      "ci review",
      "CI markdown review",
      (builder) =>
        withCwdOption(builder).option("output", {
          type: "string",
          describe: "Output markdown path",
        }),
      async (options: YargsArgs) => {
        process.exitCode = await executeCliArgs({
          command: "ci",
          subcommand: "review",
          cwd: coerceCwd(options),
          ...(options.output === undefined ? {} : { output: String(options.output) }),
        });
      },
    )
    .command(
      "debug",
      "Debug utilities",
      (yargsBuilder) =>
        yargsBuilder
          .command(
            "config",
            "Show config paths and loaded config",
            (builder) => builder,
            async () => {
              console.log(renderConfig(loadConfig()));
              process.exitCode = 0;
            },
          )
          .command("info", "Runtime info", (builder) => builder, async () => {
            process.exitCode = await executeDebugInfo();
          })
          .demandCommand(1),
    )
    .fail((message, error, yargsInstance) => {
      if (message) {
        console.error(message);
      }
      if (error) {
        console.error(error.message);
      }
      yargsInstance.showHelp();
      process.exitCode = 1;
    });
}

export async function runCli(argv: string[]): Promise<number> {
  const normalized = normalizeArgv(argv);
  if (normalized.includes("--help") || normalized.includes("-h")) {
    printCliLogo(VERSION);
  }

  try {
    const cli = buildCli(normalized);
    await cli.parseAsync(normalized, { "--": false });
    return typeof process.exitCode === "number" ? process.exitCode : 0;
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error(error.message);
      return 1;
    }
    console.error(error);
    return 1;
  }
}
