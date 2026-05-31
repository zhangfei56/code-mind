import assert from "node:assert/strict";
import {
  AGENT_MODES,
  DEFAULT_AGENT_MODE,
  PLAN_TOOLS_MODES,
  READ_TOOLS_MODES,
  WRITE_TOOLS_MODES,
  activityLabel,
  createEmptyToolActivityCounts,
  deriveActivityFromTool,
  getEffectiveResultStatus,
  isAgentRunSuccessful,
  getApplyPatchSchemaDescription,
  parsePatch,
  readRequestedMaxSteps,
  toolActivityBucket,
} from "@code-mind/shared";
import type { AgentResult, UserTask } from "@code-mind/shared";

export function runSharedFoundationTests(): void {
  assert.deepEqual(AGENT_MODES, ["ask", "plan", "edit", "agent"]);
  assert.equal(DEFAULT_AGENT_MODE, "edit");
  assert.ok(READ_TOOLS_MODES.includes("ask"));
  assert.ok(PLAN_TOOLS_MODES.includes("plan"));
  assert.ok(WRITE_TOOLS_MODES.includes("agent"));

  const counts = createEmptyToolActivityCounts();
  assert.deepEqual(counts, { read: 0, search: 0, edit: 0, shell: 0 });

  const readCall = deriveActivityFromTool({
    id: "c1",
    name: "read_file",
    arguments: { path: "a.ts" },
  });
  assert.equal(readCall, "reading");
  assert.equal(toolActivityBucket("grep"), "search");
  assert.equal(toolActivityBucket("glob"), "search");
  assert.equal(toolActivityBucket("write_file"), "edit");
  assert.equal(toolActivityBucket("delete_file"), "edit");
  assert.equal(activityLabel("thinking"), "Thinking");

  const applyPatchDescription = getApplyPatchSchemaDescription();
  assert.match(applyPatchDescription, /\*\*\* Begin Patch/);
  assert.match(applyPatchDescription, /\*\*\* Update File:/);

  const patch = parsePatch(`*** Begin Patch
*** Update File: src/a.ts
@@
-old
+new
*** End Patch`);
  assert.equal(patch.filePath, "src/a.ts");
  assert.equal(patch.oldText, "old");
  assert.equal(patch.newText, "new");

  const task: UserTask = {
    id: "t1",
    text: "task",
    cwd: ".",
    mode: "edit",
    maxSteps: 5,
    metadata: { requestedMaxSteps: 12 },
  };
  assert.equal(readRequestedMaxSteps(task), 12);
  assert.equal(readRequestedMaxSteps({ ...task, metadata: {} }), 5);

  const result: AgentResult = {
    sessionId: "s1",
    status: "incomplete",
    effectiveStatus: "success",
    finalText: "ok",
    steps: 1,
    modelName: "local",
  };
  assert.equal(getEffectiveResultStatus(result), "success");
  assert.equal(isAgentRunSuccessful(result), true);
  assert.equal(isAgentRunSuccessful({ ...result, effectiveStatus: "failed" }), false);
}
