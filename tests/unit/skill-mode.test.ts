import assert from "node:assert/strict";
import { ValidationError } from "@code-mind/shared";
import { resolveSkillMode } from "@code-mind/capabilities";

export function runSkillModeTests(): void {
  assert.equal(
    resolveSkillMode({ name: "review", allowedModes: ["ask"] }, "ask", true),
    "ask",
  );
  assert.equal(
    resolveSkillMode({ name: "review", allowedModes: ["ask"] }, "edit", false),
    "ask",
  );
  assert.throws(
    () =>
      resolveSkillMode({ name: "review", allowedModes: ["ask"] }, "edit", true),
    ValidationError,
  );
}
