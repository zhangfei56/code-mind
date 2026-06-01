import assert from "node:assert/strict";
import { shouldRequestClarify, buildClarifyQuestion } from "@code-mind/core";

export function runTaskClarityResolutionTests(): void {
  assert.equal(
    shouldRequestClarify({
      id: "t1",
      text: "fix test",
      cwd: "/tmp/demo",
      mode: "agent",
      maxSteps: 12,
    }),
    true,
  );
  assert.equal(
    shouldRequestClarify({
      id: "t2",
      text: "fix test",
      cwd: "/tmp/demo",
      mode: "agent",
      maxSteps: 12,
      metadata: { source: "benchmark" },
    }),
    false,
  );
  const question = buildClarifyQuestion(
    {
      id: "t3",
      text: "fix test",
      cwd: "/tmp/demo",
      mode: "agent",
      maxSteps: 12,
    },
    "/tmp/demo",
    "en",
  );
  assert.match(question, /Verification command/i);
}
