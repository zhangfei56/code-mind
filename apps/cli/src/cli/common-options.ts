import type { Argv } from "yargs";
import { AGENT_MODES, type EventLevel } from "@code-mind/shared";
import type { AgentMode } from "@code-mind/shared";
import type { RunCliArgs } from "./parse-args.js";

export interface RunOptions {
  cwd: string;
  model?: string;
  mode: string;
  modeExplicit?: boolean;
  maxSteps: number;
  plan?: boolean;
  worktree?: boolean;
  skill?: string;
  auto?: boolean;
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
  tui?: boolean;

}

export function withCwdOption(yargs: Argv): Argv {
  return yargs.option("cwd", {
    type: "string",
    default: process.cwd(),
    describe: "Workspace root directory",
  });
}

export function withSessionOptions(yargs: Argv): Argv {
  return yargs
    .option("continue", {
      alias: "c",
      type: "boolean",
      default: false,
      describe: "Continue the most recent session",
    })
    .option("session", {
      alias: "s",
      type: "string",
      describe: "Session ID to continue",
    })
    .option("fork", {
      type: "boolean",
      default: false,
      describe: "Fork the session when continuing",
    });
}

export function withRunOptions(yargs: Argv): Argv {
  return withSessionOptions(
    withCwdOption(yargs)
      .option("model", {
        alias: "m",
        type: "string",
        describe: "Model config key or provider:model selector",
      })
      .option("mode", {
        type: "string",
        choices: AGENT_MODES,
        default: "edit",
        describe: "Agent mode",
      })
      .option("max-steps", {
        type: "number",
        default: 10,
        describe: "Maximum agent steps",
      })
      .option("plan", {
        type: "boolean",
        default: false,
        describe: "Plan-first: plan session then execute",
      })
      .option("worktree", {
        type: "boolean",
        default: false,
        describe: "Run in an isolated git worktree",
      })
      .option("skill", {
        type: "string",
        describe: "Skill name to prepend to the task",
      })
      .option("auto", {
        type: "boolean",
        default: false,
        describe: "Promote edit mode to agent for automatic execution",
      })
      .option("file", {
        alias: "f",
        type: "string",
        describe: "Read task prompt from a file",
      })
      .option("json", {
        type: "boolean",
        default: false,
        describe: "Output structured JSON result",
      })
      .option("jsonl", {
        type: "boolean",
        default: false,
        describe: "Output newline-delimited JSON events and final result",
      })
      .option("verbose", {
        type: "boolean",
        default: false,
        describe: "Show detailed step/tool progress (L2)",
      })
      .option("trace", {
        type: "boolean",
        default: false,
        describe: "Show token/context trace details (L3)",
      })
      .option("debug", {
        type: "boolean",
        default: false,
        describe: "Show full runtime event stream (L4)",
      })
      .option("tui", {
        type: "boolean",
        default: false,
        describe: "Start the experimental full-screen TUI REPL",
      })
      .option("log-level", {
        type: "string",
        choices: ["error", "warn", "info", "debug"] as const,
        describe: "Override log level for this command",
      }),
  );
}

export function runOptionsToCliArgs(task: string, options: RunOptions): RunCliArgs {
  const mode: AgentMode =
    options.auto && options.mode === "edit"
      ? "agent"
      : (options.mode as AgentMode);

  return {
    task,
    cwd: options.cwd,
    mode,
    modeExplicit: options.modeExplicit ?? false,
    maxSteps: options.maxSteps,
    ...(options.model === undefined ? {} : { model: options.model }),
    ...(options.plan ? { planFirst: true } : {}),
    ...(options.worktree ? { useWorktree: true } : {}),
    ...(options.skill === undefined ? {} : { skill: options.skill }),
    ...(options.continue ? { continue: true } : {}),
    ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
    ...(options.fork ? { fork: true } : {}),
    ...(options.promptFile === undefined ? {} : { promptFile: options.promptFile }),
    ...(options.json ? { json: true } : {}),
    ...(options.jsonl ? { jsonl: true } : {}),
    ...(options.verbose ? { verbose: true } : {}),
    ...(options.trace ? { trace: true } : {}),
    ...(options.debug ? { debug: true } : {}),
    ...(options.logLevel === undefined ? {} : { logLevel: options.logLevel }),
    ...(options.tui ? { tui: true } : {}),
  };
}

export function coerceRunOptions(options: Record<string, unknown>): RunOptions {
  const session =
    options.session === undefined ? undefined : String(options.session);
  const file = options.file === undefined ? undefined : String(options.file);

  return {
    cwd: String(options.cwd ?? process.cwd()),
    mode: String(options.mode ?? "edit"),
    maxSteps: Number(options.maxSteps ?? options["max-steps"] ?? 10),
    ...(options.model === undefined ? {} : { model: String(options.model) }),
    ...(options.plan ? { plan: true } : {}),
    ...(options.worktree ? { worktree: true } : {}),
    ...(options.skill === undefined ? {} : { skill: String(options.skill) }),
    ...(options.auto ? { auto: true } : {}),
    ...(options.continue ? { continue: true } : {}),
    ...(session === undefined ? {} : { sessionId: session }),
    ...(options.fork ? { fork: true } : {}),
    ...(file === undefined ? {} : { promptFile: file }),
    ...(options.json ? { json: true } : {}),
    ...(options.jsonl ? { jsonl: true } : {}),
    ...(options.verbose ? { verbose: true } : {}),
    ...(options.trace ? { trace: true } : {}),
    ...(options.debug ? { debug: true } : {}),
    ...(options.tui ? { tui: true } : {}),
    ...(options["log-level"] === undefined
      ? {}
      : { logLevel: String(options["log-level"]) as Exclude<EventLevel, "trace"> }),
  };
}

export function coerceCwd(options: Record<string, unknown>): string {
  return String(options.cwd ?? process.cwd());
}
