import assert from "node:assert/strict";
import { PermissionEngine } from "@code-mind/security";
import type { PermissionRequest, ToolCall } from "@code-mind/shared";

function createRequest(
  toolCall: ToolCall,
  mode: PermissionRequest["mode"] = "edit",
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
      arguments: {
        patch: [
          "*** Begin Patch",
          "*** Update File: src/math.ts",
          "@@",
          "-old",
          "+new",
          "*** End Patch",
        ].join("\n"),
      },
    }),
  );
  assert.equal(askPatch.type, "ask");

  const allowPatch = await engine.check(
    createRequest(
      {
        id: "call_4",
        name: "apply_patch",
        arguments: {
          patch: [
            "*** Begin Patch",
            "*** Update File: src/math.ts",
            "@@",
            "-old",
            "+new",
            "*** End Patch",
          ].join("\n"),
        },
      },
      "agent",
    ),
  );
  assert.equal(allowPatch.type, "allow");

  const askPackagePatch = await engine.check(
    createRequest(
      {
        id: "call_4b",
        name: "apply_patch",
        arguments: {
          patch: [
            "*** Begin Patch",
            "*** Update File: package.json",
            "@@",
            "-\"name\": \"a\"",
            "+\"name\": \"b\"",
            "*** End Patch",
          ].join("\n"),
        },
      },
      "agent",
    ),
  );
  assert.equal(askPackagePatch.type, "ask");

  const denyWorkflowPatch = await engine.check(
    createRequest(
      {
        id: "call_4c",
        name: "apply_patch",
        arguments: {
          patch: [
            "*** Begin Patch",
            "*** Update File: .github/workflows/ci.yml",
            "@@",
            "-old",
            "+new",
            "*** End Patch",
          ].join("\n"),
        },
      },
      "agent",
    ),
  );
  assert.equal(denyWorkflowPatch.type, "deny");

  const allowTest = await engine.check(
    createRequest(
      {
        id: "call_5",
        name: "run_shell",
        arguments: { command: "npm test" },
      },
      "agent",
    ),
  );
  assert.equal(allowTest.type, "allow");

  const askTestInEdit = await engine.check(
    createRequest(
      {
        id: "call_5a",
        name: "run_shell",
        arguments: { command: "npm test" },
      },
      "edit",
    ),
  );
  assert.equal(askTestInEdit.type, "ask");

  const allowReadOnlyShell = await engine.check(
    createRequest(
      {
        id: "call_5b",
        name: "run_shell",
        arguments: { command: "git diff" },
      },
      "ask",
    ),
  );
  assert.equal(allowReadOnlyShell.type, "allow");

  const denyMutatingAskShell = await engine.check(
    createRequest(
      {
        id: "call_5c",
        name: "run_shell",
        arguments: { command: "npm test" },
      },
      "ask",
    ),
  );
  assert.equal(denyMutatingAskShell.type, "deny");

  const denyDangerous = await engine.check(
    createRequest(
      {
        id: "call_6",
        name: "run_shell",
        arguments: { command: "rm -rf ." },
      },
      "agent",
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
      "agent",
    ),
  );
  assert.equal(askInstall.type, "ask");

  const allowGlob = await engine.check(
    createRequest({
      id: "call_8",
      name: "glob",
      arguments: { pattern: "**/*.ts" },
    }),
  );
  assert.equal(allowGlob.type, "allow");

  const askWriteFile = await engine.check(
    createRequest(
      {
        id: "call_9",
        name: "write_file",
        arguments: { path: "src/a.ts", content: "export {}\n" },
      },
      "edit",
    ),
  );
  assert.equal(askWriteFile.type, "ask");

  const denyWriteInAsk = await engine.check(
    createRequest(
      {
        id: "call_10",
        name: "search_replace",
        arguments: {
          path: "src/a.ts",
          old_string: "old",
          new_string: "new",
        },
      },
      "ask",
    ),
  );
  assert.equal(denyWriteInAsk.type, "deny");

  const askDeleteInEdit = await engine.check(
    createRequest(
      {
        id: "call_11",
        name: "delete_file",
        arguments: { path: "src/a.ts" },
      },
      "edit",
    ),
  );
  assert.equal(askDeleteInEdit.type, "ask");

  const askMoveInEdit = await engine.check(
    createRequest(
      {
        id: "call_12",
        name: "move_file",
        arguments: { from: "src/a.ts", to: "src/b.ts" },
      },
      "edit",
    ),
  );
  assert.equal(askMoveInEdit.type, "ask");
}
