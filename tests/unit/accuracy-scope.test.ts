import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRepoMap } from "@code-mind/context";
import {
  createEmptyExplorationEvidence,
  createDefaultToolRegistry,
  createLoopPolicy,
  createRunState,
  selectToolSchemasForModel,
  shouldGateFileMutations,
} from "@code-mind/core";

export async function runAccuracyScopeTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-scope-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  writeFileSync(join(workspace, "package.json"), "{}\n", "utf8");
  writeFileSync(join(workspace, "src", "math.ts"), "export {}\n", "utf8");
  writeFileSync(join(workspace, "test.js"), "console.log('ok')\n", "utf8");

  const repoMap = await buildRepoMap(workspace);
  assert.match(repoMap, /package\.json/);
  assert.match(repoMap, /math\.ts/);

  const task = {
    id: "task_scope",
    text: "fix test",
    cwd: workspace,
    mode: "agent" as const,
    maxSteps: 12,
  };
  const strategy = createLoopPolicy(task, workspace);
  assert.equal(strategy.forceNarrowingAfterBudget, true);

  const evidence = createEmptyExplorationEvidence();
  assert.equal(
    shouldGateFileMutations({
      task,
      workspaceRoot: workspace,
      policy: strategy,
      evidence,
      modifiedFilesCount: 0,
    }),
    true,
  );

  evidence.projectRootConfirmed = true;
  evidence.candidateFileLocated = true;
  evidence.verificationCommandKnown = true;
  assert.equal(
    shouldGateFileMutations({
      task,
      workspaceRoot: workspace,
      policy: strategy,
      evidence,
      modifiedFilesCount: 0,
    }),
    false,
  );

  const runState = createRunState(task);
  const registry = createDefaultToolRegistry();
  const gated = selectToolSchemasForModel(registry, runState, {
    enterClosingTurn: false,
    task,
    workspaceRoot: workspace,
    strategy,
  });
  assert.equal(gated.trigger, "exploration_gate");
  assert.ok(!gated.tools.some((schema) => schema.name === "apply_patch"));
  assert.ok(gated.tools.some((schema) => schema.name === "run_shell"));
}
