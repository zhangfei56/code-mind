import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPatchTool } from "@code-mind/execution";
import { runShellTool } from "@code-mind/execution";
import type { ToolContext } from "@code-mind/shared";

function createContext(workspaceRoot: string): ToolContext {
  return {
    sessionId: "session_high_risk",
    workspaceRoot,
    cwd: workspaceRoot,
    mode: "agent",
  };
}

export async function runHighRiskToolTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-high-risk-"));
  mkdirSync(join(workspace, "src"));
  writeFileSync(
    join(workspace, "src", "math.ts"),
    "export function add(a: number, b: number) {\n  return a - b;\n}\n",
    "utf8",
  );

  const context = createContext(workspace);
  const patch = [
    "*** Begin Patch",
    "*** Update File: src/math.ts",
    "@@",
    "-  return a - b;",
    "+  return a + b;",
    "*** End Patch",
  ].join("\n");

  const patchResult = await applyPatchTool.execute({ patch }, context);
  assert.equal(patchResult.success, true);
  assert.match(readFileSync(join(workspace, "src", "math.ts"), "utf8"), /a \+ b/);
  assert.match(patchResult.output, /Diff preview|Begin Patch|return a \+ b/);
  const diffsDir = join(
    workspace,
    ".agent",
    "sessions",
    context.sessionId,
    "diffs",
  );
  assert.equal(existsSync(diffsDir), true);
  assert.equal(readdirSync(diffsDir).length > 0, true);

  const shellResult = await runShellTool.execute(
    { command: "node -e \"console.log('ok')\"", timeoutMs: 5_000 },
    context,
  );
  assert.equal(shellResult.success, true);
  assert.match(shellResult.output, /ok/);
}
