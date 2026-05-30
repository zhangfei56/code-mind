import assert from "node:assert/strict";
import { ValidationError } from "@code-mind/shared";
import { parseArgs } from "../../apps/cli/src/cli/parse-args.js";

export function runParseArgsTests(): void {
  const interactiveDefaults = parseArgs([]);
  assert.deepEqual(interactiveDefaults, {
    command: "interactive",
    cwd: process.cwd(),
    mode: "edit",
    maxSteps: 10,
  });

  const interactiveWithFlags = parseArgs(["--cwd", ".", "--model", "local:demo", "--mode", "agent"]);
  assert.deepEqual(interactiveWithFlags, {
    command: "interactive",
    cwd: ".",
    model: "local:demo",
    mode: "agent",
    maxSteps: 10,
  });

  const interactiveWithLogging = parseArgs([
    "--cwd",
    ".",
    "--log-level",
    "debug",
  ]);
  assert.deepEqual(interactiveWithLogging, {
    command: "interactive",
    cwd: ".",
    mode: "edit",
    maxSteps: 10,
    logLevel: "debug",
  });

  const configShow = parseArgs(["config", "show"]);
  assert.deepEqual(configShow, {
    command: "config",
    subcommand: "show",
  });

  const sessionsList = parseArgs(["sessions", "list"]);
  assert.deepEqual(sessionsList, {
    command: "sessions",
    subcommand: "list",
    cwd: process.cwd(),
  });

  const sessionsShow = parseArgs(["sessions", "show", "session_123", "--cwd", "."]);
  assert.deepEqual(sessionsShow, {
    command: "sessions",
    subcommand: "show",
    sessionId: "session_123",
    cwd: ".",
  });

  const sessionsResume = parseArgs([
    "sessions",
    "resume",
    "session_123",
    "--cwd",
    ".",
    "--model",
    "local:demo",
    "--max-steps",
    "7",
  ]);
  assert.deepEqual(sessionsResume, {
    command: "sessions",
    subcommand: "resume",
    sessionId: "session_123",
    cwd: ".",
    model: "local:demo",
    maxSteps: 7,
  });

  const defaults = parseArgs(["修复测试失败"]);
  assert.deepEqual(defaults, {
    task: "修复测试失败",
    cwd: process.cwd(),
    mode: "edit",
    modeExplicit: false,
    maxSteps: 10,
  });

  const withFlags = parseArgs([
    "修复测试失败",
    "--cwd",
    ".",
    "--model",
    "local",
    "--mode",
    "agent",
    "--max-steps",
    "7",
    "--plan",
    "--worktree",
  ]);

  assert.deepEqual(withFlags, {
    task: "修复测试失败",
    cwd: ".",
    model: "local",
    mode: "agent",
    modeExplicit: true,
    maxSteps: 7,
    planFirst: true,
    useWorktree: true,
  });

  const planMode = parseArgs(["重构 auth 模块", "--mode", "plan"]);
  assert.deepEqual(planMode, {
    task: "重构 auth 模块",
    cwd: process.cwd(),
    mode: "plan",
    modeExplicit: true,
    maxSteps: 10,
  });

  const askSubcommand = parseArgs(["ask", "解释这个项目"]);
  assert.deepEqual(askSubcommand, {
    task: "解释这个项目",
    cwd: process.cwd(),
    mode: "ask",
    modeExplicit: true,
    maxSteps: 10,
  });

  const editAuto = parseArgs(["edit", "修 failing test", "--auto"]);
  assert.deepEqual(editAuto, {
    task: "修 failing test",
    cwd: process.cwd(),
    mode: "agent",
    modeExplicit: true,
    maxSteps: 10,
  });

  const verify = parseArgs(["verify", "--cwd", ".", "--test", "--lint"]);
  assert.deepEqual(verify, {
    command: "verify",
    cwd: ".",
    test: true,
    lint: true,
  });

  const review = parseArgs(["review", "--cwd", "."]);
  assert.deepEqual(review, {
    command: "review",
    cwd: ".",
  });

  assert.throws(
    () => parseArgs(["fix bug", "--mode", "invalid"]),
    ValidationError,
    "PA-06",
  );

  assert.throws(
    () => parseArgs(["ask"]),
    ValidationError,
    "PA-07",
  );

  assert.throws(
    () => parseArgs(["--mode", "read_only", "x"]),
    ValidationError,
    "PA-08",
  );

  const agentSubcommand = parseArgs(["agent", "fix bug", "--max-steps", "20"]);
  assert.deepEqual(agentSubcommand, {
    task: "fix bug",
    cwd: process.cwd(),
    mode: "agent",
    modeExplicit: true,
    maxSteps: 20,
  });

  const continueRun = parseArgs(["run", "--continue", "--cwd", "."]);
  assert.deepEqual(continueRun, {
    task: "",
    cwd: ".",
    mode: "edit",
    modeExplicit: false,
    maxSteps: 10,
    continue: true,
  });

  const jsonRun = parseArgs(["run", "fix bug", "--json"]);
  assert.deepEqual(jsonRun, {
    task: "fix bug",
    cwd: process.cwd(),
    mode: "edit",
    modeExplicit: false,
    maxSteps: 10,
    json: true,
  });

  const jsonlRun = parseArgs(["run", "fix bug", "--jsonl"]);
  assert.deepEqual(jsonlRun, {
    task: "fix bug",
    cwd: process.cwd(),
    mode: "edit",
    modeExplicit: false,
    maxSteps: 10,
    jsonl: true,
  });

  const loggedRun = parseArgs([
    "run",
    "fix bug",
    "--log-level",
    "debug",
  ]);
  assert.deepEqual(loggedRun, {
    task: "fix bug",
    cwd: process.cwd(),
    mode: "edit",
    modeExplicit: false,
    maxSteps: 10,
    logLevel: "debug",
  });

  const promptFileRun = parseArgs(["run", "--file", "prompt.md", "--cwd", "."]);
  assert.deepEqual(promptFileRun, {
    task: "",
    cwd: ".",
    mode: "edit",
    modeExplicit: false,
    maxSteps: 10,
    promptFile: "prompt.md",
  });
}
