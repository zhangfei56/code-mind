import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VerificationPipeline } from "@code-mind/verify";

export async function runVerifyPipelineTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-verify-empty-"));
  const pipeline = new VerificationPipeline();
  const result = await pipeline.run(workspace);

  assert.equal(result.passed, false);
  assert.equal(result.steps.length, 0);
  assert.match(result.summary ?? "", /No verification commands detected/i);
}
