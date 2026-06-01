import assert from "node:assert/strict";
import {
  applySkillToolConstraints,
  collectPendingSkills,
  injectCapabilityContextBlocks,
  mergeSelectedCapabilities,
  selectCapabilities,
} from "../../packages/capabilities/src/capability-selector.js";
import type { SkillDefinition } from "@code-mind/shared";

const reviewSkill: SkillDefinition = {
  name: "code-review",
  description: "Review code changes and summarize findings.",
  path: "/tmp/code-review",
  content: "# Code Review\n\nFocus on correctness and tests.",
  allowedModes: ["ask", "edit", "agent"],
};

const browserSkill: SkillDefinition = {
  name: "browser",
  description: "Open pages and capture screenshots for visual verification.",
  path: "/tmp/browser",
  content: "# Browser\n\nUse for screenshot workflows.",
  tools: ["browser_navigate"],
};

export async function runCapabilitySelectorTests(): Promise<void> {
  const explicit = selectCapabilities({
    taskText: "Please run code-review on the latest diff.",
    mode: "edit",
    skills: [reviewSkill, browserSkill],
    plugins: [],
  });
  assert.equal(explicit.skills.length, 1);
  assert.equal(explicit.skills[0]?.name, "code-review");
  assert.equal(explicit.auditReasons[0]?.trigger, "explicit");
  assert.ok(explicit.contextBlocks.some((block) => block.source === "skill:code-review"));

  const workflowPending = collectPendingSkills({
    taskText: "Verify the homepage layout visually.",
    mode: "agent",
    skills: [reviewSkill, browserSkill],
    plugins: [],
  });
  assert.equal(workflowPending.length, 1);
  assert.equal(workflowPending[0]?.name, "browser");

  const workflow = selectCapabilities({
    taskText: "screenshot the homepage layout for visual check",
    mode: "agent",
    skills: [reviewSkill, browserSkill],
    plugins: [],
  });
  assert.equal(workflow.skills.length, 1);
  assert.equal(workflow.skills[0]?.name, "browser");
  assert.match(String(workflow.contextBlocks[0]?.content), /Active skill/);

  const pluginBundle = selectCapabilities({
    taskText: "run my-frontend-plugin on the page",
    mode: "agent",
    skills: [browserSkill],
    plugins: [{ name: "my-frontend-plugin", description: "frontend UI tools", skills: ["browser"] }],
  });
  assert.ok(pluginBundle.skills.some((skill) => skill.name === "browser"));
  assert.ok(
    pluginBundle.contextBlocks.some((block) => block.content.includes("read_skill")),
  );

  const closing = selectCapabilities({
    taskText: "anything",
    mode: "edit",
    skills: [reviewSkill],
    plugins: [],
    enterClosingTurn: true,
  });
  assert.deepEqual(closing.skills, []);
  assert.equal(closing.auditReasons[0]?.trigger, "closing_turn");

  const merged = mergeSelectedCapabilities(explicit, {
    tools: [{ name: "read_file", description: "Read a file", parameters: { type: "object", properties: {} } }],
    trigger: "runtime_mode",
    reason: "Tools selected for active runtime mode.",
  });
  assert.equal(merged.toolSchemas.length, 1);
  assert.equal(merged.auditReasons.at(-1)?.targetKind, "tool");

  const messages = injectCapabilityContextBlocks(
    [
      { role: "system", content: "base" },
      { role: "user", content: "hello" },
    ],
    explicit.contextBlocks,
    (content) => ({ role: "system", content }),
  );
  assert.equal(messages.length, 3);
  assert.match(String(messages[1]?.content), /capability_context/);
  assert.equal(messages[2]?.role, "user");

  const forced = selectCapabilities({
    taskText: "fix unrelated bug",
    mode: "edit",
    skills: [reviewSkill, browserSkill],
    plugins: [],
    forceSkillNames: ["code-review"],
    maxActive: 1,
    exclusiveForce: true,
  });
  assert.equal(forced.skills.length, 1);
  assert.equal(forced.skills[0]?.name, "code-review");
  assert.equal(forced.auditReasons[0]?.reason.includes("forced"), true);

  const forcedBrowser = selectCapabilities({
    taskText: "fix unrelated bug",
    mode: "agent",
    skills: [reviewSkill, browserSkill],
    plugins: [],
    forceSkillNames: ["browser"],
    maxActive: 1,
    exclusiveForce: true,
  });
  const toolFiltered = applySkillToolConstraints(
    mergeSelectedCapabilities(forcedBrowser, {
      tools: [
        { name: "read_file", description: "Read", parameters: { type: "object", properties: {} } },
        { name: "browser_navigate", description: "Nav", parameters: { type: "object", properties: {} } },
        { name: "grep", description: "Grep", parameters: { type: "object", properties: {} } },
      ],
      trigger: "runtime_mode",
      reason: "mode tools",
    }),
  );
  assert.deepEqual(
    toolFiltered.toolSchemas.map((schema) => schema.name),
    ["browser_navigate"],
  );

  const repairTask = selectCapabilities({
    taskText: "fix the bug in the auth module",
    mode: "agent",
    skills: [browserSkill],
    plugins: [],
  });
  assert.equal(repairTask.skills.length, 0);

  const codeSkill: SkillDefinition = {
    name: "code-review",
    description: "Review code changes.",
    path: "/tmp/cr",
    content: "# CR",
  };
  const weakBrowser: SkillDefinition = {
    name: "browser",
    description: "Screenshot and visual browser verification.",
    path: "/tmp/browser",
    content: "# Browser",
  };
  const gapResult = selectCapabilities({
    taskText: "screenshot homepage layout and run code-review on the diff",
    mode: "agent",
    skills: [weakBrowser, codeSkill],
    plugins: [],
    maxActive: 2,
  });
  assert.equal(gapResult.skills.length, 1);
  assert.equal(gapResult.skills[0]?.name, "code-review");
  assert.ok(
    gapResult.auditReasons.some(
      (entry) => entry.target === "browser" && entry.reason.includes("below top"),
    ),
  );

  const confirmed = selectCapabilities({
    taskText: "verify layout only",
    mode: "agent",
    skills: [browserSkill],
    plugins: [],
    confirmedSkillNames: ["browser"],
  });
  assert.equal(confirmed.skills.length, 1);
  assert.equal(confirmed.skills[0]?.contextStyle, "snippet");
}
