import assert from "node:assert/strict";
import { PermissionEngine } from "@code-mind/security";
import { getRunSubagentPermission } from "@code-mind/security";
import type { PermissionRequest, ToolCall } from "@code-mind/shared";

function createRequest(
  toolCall: ToolCall,
  extra: Partial<PermissionRequest> = {},
): PermissionRequest {
  return {
    toolCall,
    mode: "edit",
    workspaceRoot: "/tmp/workspace",
    ...extra,
  };
}

export async function runSubagentPermissionTests(): Promise<void> {
  const engine = new PermissionEngine();

  const allowExplore = await engine.check(
    createRequest({
      id: "call_explore",
      name: "run_subagent",
      arguments: { agentName: "explore", task: "Trace X from A to B" },
    }),
  );
  assert.equal(allowExplore.type, "allow");

  const allowPlan = await engine.check(
    createRequest(
      {
        id: "call_plan",
        name: "run_subagent",
        arguments: { agentName: "plan", task: "Draft steps for Y" },
      },
      { mode: "plan" },
    ),
  );
  assert.equal(allowPlan.type, "allow");

  const denyNested = await engine.check(
    createRequest(
      {
        id: "call_nested",
        name: "run_subagent",
        arguments: { agentName: "explore", task: "nested" },
      },
      { isSubagentSession: true },
    ),
  );
  assert.equal(denyNested.type, "deny");

  const allowReadOnlyCustom = await engine.check(
    createRequest(
      {
        id: "call_reviewer",
        name: "run_subagent",
        arguments: { agentName: "code-reviewer", task: "Review diff" },
      },
      {
        subagentKnown: true,
        subagentTools: ["read_file", "grep", "git_diff"],
        subagentRole: "general",
      },
    ),
  );
  assert.equal(allowReadOnlyCustom.type, "allow");

  const askWriteCustom = await engine.check(
    createRequest(
      {
        id: "call_writer",
        name: "run_subagent",
        arguments: { agentName: "writer", task: "Apply fix" },
      },
      {
        subagentKnown: true,
        subagentTools: ["read_file", "apply_patch"],
        subagentRole: "general",
      },
    ),
  );
  assert.equal(askWriteCustom.type, "ask");
  assert.match(
    "reason" in askWriteCustom ? askWriteCustom.reason : "",
    /write tools/i,
  );

  const askOverriddenExplore = await engine.check(
    createRequest(
      {
        id: "call_explore_write",
        name: "run_subagent",
        arguments: { agentName: "explore", task: "Patch files" },
      },
      {
        subagentKnown: true,
        subagentTools: ["read_file", "apply_patch"],
        subagentRole: "explore",
      },
    ),
  );
  assert.equal(askOverriddenExplore.type, "ask");

  const denyUnknown = await engine.check(
    createRequest(
      {
        id: "call_unknown",
        name: "run_subagent",
        arguments: { agentName: "missing-agent", task: "Do work" },
      },
      { subagentKnown: false },
    ),
  );
  assert.equal(denyUnknown.type, "deny");
  assert.match("reason" in denyUnknown ? denyUnknown.reason : "", /Unknown sub-agent/i);

  const denyWriteInPlan = getRunSubagentPermission({
    mode: "plan",
    planModeActive: true,
    agentName: "writer",
    subagentKnown: true,
    subagentTools: ["apply_patch"],
    subagentRole: "general",
  });
  assert.equal(denyWriteInPlan.type, "deny");

  const askUnknownWithoutResolver = getRunSubagentPermission({
    mode: "edit",
    agentName: "unknown-agent",
  });
  assert.equal(askUnknownWithoutResolver.type, "ask");
  assert.match(
    "reason" in askUnknownWithoutResolver ? askUnknownWithoutResolver.reason : "",
    /delegation requires approval/i,
  );
}
