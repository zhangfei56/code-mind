import assert from "node:assert/strict";
import { parseArgs } from "../../src/cli/parse-args.js";

export function runParseArgsTests(): void {
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
    mode: "suggest",
    maxSteps: 10,
  });

  const withFlags = parseArgs([
    "修复测试失败",
    "--cwd",
    ".",
    "--model",
    "local",
    "--mode",
    "auto_edit",
    "--max-steps",
    "7",
    "--plan",
    "--worktree",
  ]);

  assert.deepEqual(withFlags, {
    task: "修复测试失败",
    cwd: ".",
    model: "local",
    mode: "auto_edit",
    maxSteps: 7,
    planFirst: true,
    useWorktree: true,
  });

  const planMode = parseArgs(["重构 auth 模块", "--mode", "plan"]);
  assert.deepEqual(planMode, {
    task: "重构 auth 模块",
    cwd: process.cwd(),
    mode: "plan",
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
}
