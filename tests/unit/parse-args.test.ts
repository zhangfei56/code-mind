import assert from "node:assert/strict";
import { parseArgs } from "../../src/cli/parse-args.js";

export function runParseArgsTests(): void {
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
  ]);

  assert.deepEqual(withFlags, {
    task: "修复测试失败",
    cwd: ".",
    model: "local",
    mode: "auto_edit",
    maxSteps: 7,
  });
}
