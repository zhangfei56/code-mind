import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertPathInWorkspace,
  isSensitivePath,
  resolvePathInWorkspace,
} from "@code-mind/workspace";
import { findProjectRules } from "@code-mind/workspace";
import { resolveWorkspace } from "@code-mind/workspace";

export function runWorkspaceTests(): void {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-workspace-"));
  const filePath = resolvePathInWorkspace(workspace, "src/math.ts");
  assert.match(filePath, /src\/math\.ts$/);

  assert.throws(() => {
    assertPathInWorkspace(workspace, join(workspace, "..", "outside.txt"));
  }, /Path escapes workspace/);

  assert.equal(isSensitivePath(".env"), true);
  assert.equal(isSensitivePath("secrets/token.txt"), true);
  assert.equal(isSensitivePath("src/math.ts"), false);

  mkdirSync(join(workspace, "src"));
  writeFileSync(join(workspace, "AGENTS.md"), "修改后必须运行 npm test。", "utf8");
  const rules = findProjectRules(workspace);
  assert.match(rules.content ?? "", /npm test/);
  assert.equal(rules.source, join(workspace, "AGENTS.md"));

  mkdirSync(join(workspace, ".git"));
  mkdirSync(join(workspace, "packages", "cli"), { recursive: true });
  const nestedWorkspace = resolveWorkspace(join(workspace, "packages", "cli"));
  assert.equal(nestedWorkspace, workspace);

  const childProject = join(workspace, "examples", "demo");
  mkdirSync(childProject, { recursive: true });
  writeFileSync(join(childProject, "package.json"), "{\"name\":\"demo\"}", "utf8");
  assert.equal(resolveWorkspace(childProject), childProject);

  const standalone = mkdtempSync(join(tmpdir(), "code-mind-standalone-"));
  assert.equal(resolveWorkspace(standalone), standalone);
}
