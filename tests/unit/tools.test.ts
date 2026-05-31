import assert from "node:assert/strict";
import { access, constants } from "node:fs";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearWorkspaceIgnoreCache } from "@code-mind/workspace";
import {
  applyPatchTool,
  deleteFileTool,
  globPatternToRegExp,
  globTool,
  grepTool,
  listDirTool,
  moveFileTool,
  readFileTool,
  searchReplaceTool,
  ToolRegistry,
  registerDefaultTools,
  writeFileTool,
} from "@code-mind/execution";
import type { ToolContext } from "@code-mind/shared";

const accessAsync = promisify(access);

function createContext(workspaceRoot: string): ToolContext {
  return {
    sessionId: "session_1",
    workspaceRoot,
    cwd: workspaceRoot,
    mode: "edit",
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

  assert.ok(globPatternToRegExp("**/*.ts").test("src/math.ts"));
  assert.ok(!globPatternToRegExp("**/*.ts").test("src/math.ts.bak"));

  const globResult = await globTool.execute({ pattern: "**/*.ts", path: "." }, context);
  assert.equal(globResult.success, true);
  assert.match(globResult.output, /src\/math\.ts/);
  assert.match(globResult.output, /tests\/math\.test\.ts/);
  assert.doesNotMatch(globResult.output, /node_modules/);

  const writeResult = await writeFileTool.execute(
    { path: "src/new.ts", content: "export const created = true;\n" },
    context,
  );
  assert.equal(writeResult.success, true);
  assert.match(writeResult.output, /Wrote src\/new\.ts/);

  const replaceResult = await searchReplaceTool.execute(
    {
      path: "src/math.ts",
      old_string: "return a - b;",
      new_string: "return a + b;",
    },
    context,
  );
  assert.equal(replaceResult.success, true);
  assert.match(replaceResult.output, /Updated src\/math\.ts/);

  const readFixed = await readFileTool.execute({ path: "src/math.ts" }, context);
  assert.match(readFixed.output, /return a \+ b;/);

  const moveResult = await moveFileTool.execute(
    { from: "src/new.ts", to: "src/renamed.ts" },
    context,
  );
  assert.equal(moveResult.success, true);
  assert.match(moveResult.output, /Moved src\/new\.ts → src\/renamed\.ts/);
  await assert.rejects(
    accessAsync(join(workspace, "src/new.ts"), constants.F_OK),
    /ENOENT/,
  );
  await accessAsync(join(workspace, "src/renamed.ts"), constants.F_OK);

  const deleteResult = await deleteFileTool.execute({ path: "tests/math.test.ts" }, context);
  assert.equal(deleteResult.success, true);
  assert.match(deleteResult.output, /Deleted tests\/math\.test\.ts/);
  await assert.rejects(
    accessAsync(join(workspace, "tests/math.test.ts"), constants.F_OK),
    /ENOENT/,
  );

  const registry = new ToolRegistry();
  registerDefaultTools(registry);
  const registryResult = await registry.execute(
    {
      id: "call_1",
      name: "read_file",
      arguments: { path: "src/math.ts" },
    },
    context,
  );
  assert.equal(registryResult.success, true);

  const escapedPathResult = await registry.execute(
    {
      id: "call_2",
      name: "read_file",
      arguments: { path: "/tmp/outside-workspace.txt" },
    },
    context,
  );
  assert.equal(escapedPathResult.success, false);
  assert.match(escapedPathResult.error ?? "", /Path escapes workspace/);

  const askSchemas = registry.getSchemasForMode("ask");
  assert.ok(askSchemas.some((schema) => schema.name === "glob"));
  assert.ok(!askSchemas.some((schema) => schema.name === "apply_patch"));
  assert.ok(!askSchemas.some((schema) => schema.name === "write_file"));

  const agentSchemas = registry.getSchemasForMode("agent");
  assert.ok(agentSchemas.some((schema) => schema.name === "read_file"));
  assert.ok(agentSchemas.some((schema) => schema.name === "write_file"));
  assert.ok(agentSchemas.some((schema) => schema.name === "search_replace"));
  assert.ok(agentSchemas.some((schema) => schema.name === "delete_file"));
  assert.ok(agentSchemas.some((schema) => schema.name === "move_file"));

  assert.match(applyPatchTool.schema.description, /\*\*\* Begin Patch/);
  assert.match(applyPatchTool.schema.description, /search_replace/);
  assert.match(readFileTool.schema.description, /startLine/);
  assert.match(readFileTool.schema.inputSchema.properties?.startLine?.description ?? "", /1-based/);
  assert.match(searchReplaceTool.schema.description, /exactly once/);
  assert.match(writeFileTool.schema.description, /apply_patch/);
}
