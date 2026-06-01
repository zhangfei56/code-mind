import assert from "node:assert/strict";
import { recallSimilarity } from "@code-mind/capabilities";
import type { SkillDefinition } from "@code-mind/shared";

export function runSkillRecallTests(): void {
  const skill: SkillDefinition = {
    name: "code-review",
    description: "Review pull requests and summarize findings.",
    path: "/tmp",
    content: "# Code Review\n\nCheck tests and style.",
  };
  const high = recallSimilarity("please review this pull request", skill);
  const low = recallSimilarity("fix the database migration", skill);
  assert.ok(high > low);
  assert.ok(high > 0);
}
