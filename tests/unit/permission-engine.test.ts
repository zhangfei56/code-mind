import assert from "node:assert/strict";
import { PermissionEngine } from "../../src/permissions/permission-engine.js";
import type { PermissionRequest, ToolCall } from "../../src/shared/types.js";

function createRequest(
  toolCall: ToolCall,
  mode: PermissionRequest["mode"] = "suggest",
): PermissionRequest {
  return {
    toolCall,
    mode,
    workspaceRoot: "/tmp/workspace",
  };
}

export async function runPermissionEngineTests(): Promise<void> {
  const engine = new PermissionEngine();

  const denySensitive = await engine.check(
    createRequest({
      id: "call_1",
      name: "read_file",
      arguments: { path: ".env" },
    }),
  );
  assert.equal(denySensitive.type, "deny");

  const allowSource = await engine.check(
    createRequest({
      id: "call_2",
      name: "read_file",
      arguments: { path: "src/a.ts" },
    }),
  );
  assert.equal(allowSource.type, "allow");

  const askPatch = await engine.check(
    createRequest({
      id: "call_3",
      name: "apply_patch",
      arguments: { patch: "*** Begin Patch" },
    }),
  );
  assert.equal(askPatch.type, "ask");

  const allowPatch = await engine.check(
    createRequest(
      {
        id: "call_4",
        name: "apply_patch",
        arguments: { patch: "*** Begin Patch" },
      },
      "auto_edit",
    ),
  );
  assert.equal(allowPatch.type, "allow");

  const allowTest = await engine.check(
    createRequest(
      {
        id: "call_5",
        name: "run_shell",
        arguments: { command: "npm test" },
      },
      "auto_edit",
    ),
  );
  assert.equal(allowTest.type, "allow");

  const denyDangerous = await engine.check(
    createRequest(
      {
        id: "call_6",
        name: "run_shell",
        arguments: { command: "rm -rf ." },
      },
      "auto_edit",
    ),
  );
  assert.equal(denyDangerous.type, "deny");

  const askInstall = await engine.check(
    createRequest(
      {
        id: "call_7",
        name: "run_shell",
        arguments: { command: "npm install lodash" },
      },
      "auto_edit",
    ),
  );
  assert.equal(askInstall.type, "ask");
}
