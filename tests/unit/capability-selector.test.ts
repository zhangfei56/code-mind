import assert from "node:assert/strict";
import {
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

  const workflow = selectCapabilities({
    taskText: "Verify the homepage layout visually.",
    mode: "agent",
    skills: [reviewSkill, browserSkill],
    plugins: [],
  });
  assert.equal(workflow.skills.length, 1);
  assert.equal(workflow.skills[0]?.name, "browser");
  assert.equal(workflow.auditReasons[0]?.trigger, "workflow");

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
}
