import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearWorkspaceIgnoreCache } from "../../src/workspace/ignore.js";
import { grepTool } from "../../src/tools/grep.js";
import { listDirTool } from "../../src/tools/list-dir.js";
import { readFileTool } from "../../src/tools/read-file.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import type { ToolContext } from "../../src/shared/types.js";

function createContext(workspaceRoot: string): ToolContext {
  return {
    sessionId: "session_1",
    workspaceRoot,
    cwd: workspaceRoot,
    mode: "suggest",
  };
}

export async function runToolTests(): Promise<void> {
  clearWorkspaceIgnoreCache();

  const workspace = mkdtempSync(join(tmpdir(), "code-mind-tools-"));
  mkdirSync(join(workspace, "src"));
  mkdirSync(join(workspace, "tests"));
  mkdirSync(join(workspace, "node_modules", "dep"), { recursive: true });
  writeFileSync(
    join(workspace, "node_modules", "dep", "index.js"),
    "export const hidden = true;\n",
    "utf8",
  );
  writeFileSync(
    join(workspace, "src", "math.ts"),
    "export function add(a: number, b: number) {\n  return a - b;\n}\n",
    "utf8",
  );
  writeFileSync(
    join(workspace, "tests", "math.test.ts"),
    "expect(add(1, 2)).toBe(3)\n",
    "utf8",
  );

  const context = createContext(workspace);

  const listResult = await listDirTool.execute({ path: ".", depth: 2 }, context);
  assert.equal(listResult.success, true);
  assert.match(listResult.output, /src\//);
  assert.match(listResult.output, /tests\//);
  assert.doesNotMatch(listResult.output, /node_modules/);

  const readResult = await readFileTool.execute({ path: "src/math.ts" }, context);
  assert.equal(readResult.success, true);
  assert.match(readResult.output, /1 export function add/);
  assert.match(readResult.output, /2   return a - b;/);

  const grepResult = await grepTool.execute(
    { pattern: "add", path: ".", include: "*.ts" },
    context,
  );
  assert.equal(grepResult.success, true);
  assert.match(grepResult.output, /src\/math\.ts:1:/);
  assert.match(grepResult.output, /tests\/math\.test\.ts:1:/);

  const registry = new ToolRegistry();
  registry.register(readFileTool);
  const registryResult = await registry.execute(
    {
      id: "call_1",
      name: "read_file",
      arguments: { path: "src/math.ts" },
    },
    context,
  );
  assert.equal(registryResult.success, true);
}
