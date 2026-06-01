import assert from "node:assert/strict";
import {
  mergeSkillRunPolicy,
  resolveRunSkillPolicy,
  resolveSkillSelectorInput,
  skillPolicyFromSettings,
} from "@code-mind/capabilities";
import type { SkillDefinition } from "@code-mind/shared";

export function runSkillPolicyTests(): void {
  const fromSettings = skillPolicyFromSettings({
    extensions: { skills: { enabled: ["code-review", "browser"] } },
  });
  assert.deepEqual(fromSettings.allowlist, ["code-review", "browser"]);

  const forced = mergeSkillRunPolicy(fromSettings, {
    mode: "force",
    forceNames: ["code-review"],
  });
  const selector = resolveSkillSelectorInput(forced);
  assert.equal(selector.exclusiveForce, true);
  assert.deepEqual(selector.forceSkillNames, ["code-review"]);
  assert.deepEqual(selector.enabledSkillNames, ["code-review"]);
  assert.equal(selector.maxActive, 1);

  const auto = resolveSkillSelectorInput(skillPolicyFromSettings({}));
  assert.equal(auto.exclusiveForce, false);
  assert.equal(auto.maxActive, 2);
  assert.equal(auto.enabledSkillNames, undefined);

  const reviewSkill: SkillDefinition = {
    name: "code-review",
    description: "Review diffs",
    path: "/tmp",
    content: "# Review",
    allowedModes: ["ask"],
  };
  const fromCommand = resolveRunSkillPolicy(skillPolicyFromSettings({}), {
    commandSkillName: "code-review",
    lookupSkill: (name) => (name === "code-review" ? reviewSkill : undefined),
  });
  assert.ok(!("error" in fromCommand));
  if ("error" in fromCommand) {
    return;
  }
  assert.deepEqual(fromCommand.forceNames, ["code-review"]);
  assert.equal(fromCommand.policy.mode, "force");
}
