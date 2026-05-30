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
}
