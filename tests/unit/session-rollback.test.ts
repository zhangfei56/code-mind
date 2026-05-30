import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { revertSession } from "@code-mind/session";
import { createTestSessionStore } from "./helpers/session-store.js";
import { captureFileSnapshot, rollbackSessionChanges } from "@code-mind/workspace";

export async function runSessionRollbackTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-rollback-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  const filePath = join(workspace, "src", "math.ts");
  writeFileSync(filePath, "export const value = 1;\n", "utf8");

  const store = createTestSessionStore(workspace);
  const session = await store.create(
    {
      id: "task_1",
      text: "demo",
      cwd: workspace,
      mode: "edit",
      maxSteps: 4,
    },
    { id: "default", name: "Default", systemPrompt: "demo" },
  );

  await captureFileSnapshot(
    workspace,
    session.id,
    "src/math.ts",
    "export const value = 1;\n",
  );
  writeFileSync(filePath, "export const value = 2;\n", "utf8");

  const rollback = await rollbackSessionChanges(workspace, session.id);
  assert.deepEqual(rollback.reverted, ["src/math.ts"]);
  assert.equal(readFileSync(filePath, "utf8"), "export const value = 1;\n");

  writeFileSync(filePath, "export const value = 9;\n", "utf8");
  const revert = await revertSession(workspace, session.id);
  assert.equal(revert.skipped, false);
  assert.deepEqual(revert.reverted, ["src/math.ts"]);
  assert.equal(readFileSync(filePath, "utf8"), "export const value = 1;\n");

  const empty = await rollbackSessionChanges(workspace, "session_missing");
  assert.equal(empty.skipped, true);
  assert.deepEqual(empty.reverted, []);
}
