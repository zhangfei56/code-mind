import assert from "node:assert/strict";
import { normalizeArgv } from "../../apps/cli/src/cli/normalize-argv.js";

export function runNormalizeArgvTests(): void {
  assert.deepEqual(normalizeArgv(["--", "run", "explain repo", "--cwd", "."]), [
    "run",
    "explain repo",
    "--cwd",
    ".",
  ]);

  assert.deepEqual(normalizeArgv(["run", "fix tests"]), ["run", "fix tests"]);

  assert.deepEqual(normalizeArgv(["edit", "fix tests", "--cwd", "."]), [
    "run",
    "fix tests",
    "--cwd",
    ".",
    "--mode",
    "edit",
  ]);

  assert.deepEqual(normalizeArgv(["sessions", "list"]), ["session", "list"]);

  assert.deepEqual(normalizeArgv(["mock", "run", "explain repo", "--cwd", "."]), [
    "mock",
    "run",
    "explain repo",
    "--cwd",
    ".",
  ]);
}
