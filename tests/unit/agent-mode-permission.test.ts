import assert from "node:assert/strict";
import { PermissionEngine } from "@code-mind/security";
import type { PermissionRequest, ToolCall } from "@code-mind/shared";

function createRequest(
  toolCall: ToolCall,
  mode: PermissionRequest["mode"],
): PermissionRequest {
  return {
    toolCall,
    mode,
    workspaceRoot: "/tmp/workspace",
  };
}

const samplePatch = [
  "*** Begin Patch",
  "*** Update File: src/math.ts",
  "@@",
  "-old",
  "+new",
  "*** End Patch",
].join("\n");

export async function runAgentModePermissionTests(): Promise<void> {
  const engine = new PermissionEngine();

  const askPatch = await engine.check(
    createRequest(
      { id: "pe_03", name: "apply_patch", arguments: { patch: samplePatch } },
      "ask",
    ),
  );
  assert.equal(askPatch.type, "deny", "PE-03");
  assert.match(askPatch.reason ?? "", /ask mode/i);

  const askShell = await engine.check(
    createRequest(
      { id: "pe_05", name: "run_shell", arguments: { command: "npm test" } },
      "ask",
    ),
  );
  assert.equal(askShell.type, "deny", "PE-05");

  const planPatch = await engine.check(
    createRequest(
      { id: "pe_06", name: "apply_patch", arguments: { patch: samplePatch } },
      "plan",
    ),
  );
  assert.equal(planPatch.type, "deny", "PE-06");

  const planDryRun = await engine.check(
    createRequest(
      { id: "pe_07", name: "run_shell", arguments: { command: "tsc --noEmit" } },
      "plan",
    ),
  );
  assert.equal(planDryRun.type, "allow", "PE-07");

  const planTest = await engine.check(
    createRequest(
      { id: "pe_08", name: "run_shell", arguments: { command: "npm test" } },
      "plan",
    ),
  );
  assert.equal(planTest.type, "deny", "PE-08");

  const planDryRunFlag = await engine.check(
    createRequest(
      {
        id: "pe_09",
        name: "run_shell",
        arguments: { command: "pnpm build --dry-run" },
      },
      "plan",
    ),
  );
  assert.equal(planDryRunFlag.type, "allow", "PE-09");

  const editPatch = await engine.check(
    createRequest(
      { id: "pe_10", name: "apply_patch", arguments: { patch: samplePatch } },
      "edit",
    ),
  );
  assert.equal(editPatch.type, "ask", "PE-10");

  const agentOutsideAllowlist = await engine.check(
    createRequest(
      {
        id: "pe_19",
        name: "apply_patch",
        arguments: {
          patch: [
            "*** Begin Patch",
            "*** Update File: tools/x.ts",
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
  assert.equal(agentOutsideAllowlist.type, "ask", "PE-19");

  const mcpDelete = await engine.check(
    createRequest(
      { id: "pe_23", name: "mcp__server__delete_item", arguments: {} },
      "agent",
    ),
  );
  assert.equal(mcpDelete.type, "deny", "PE-23");

  const mcpCreate = await engine.check(
    createRequest(
      { id: "pe_24", name: "mcp__server__create_item", arguments: {} },
      "agent",
    ),
  );
  assert.equal(mcpCreate.type, "ask", "PE-24");
}
