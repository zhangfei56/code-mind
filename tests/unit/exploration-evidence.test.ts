import assert from "node:assert/strict";
import {
  createEmptyExplorationEvidence,
  markCandidateFileLocated,
  markEntryFileRead,
  markProjectRootConfirmed,
  markVerificationCommandKnown,
  updateExplorationEvidence,
} from "@code-mind/core";

export function runExplorationEvidenceTests(): void {
  const evidence = createEmptyExplorationEvidence();

  updateExplorationEvidence(
    evidence,
    { id: "tc_1", name: "list_dir", arguments: { path: "." } },
    { success: true, output: "" },
  );
  assert.equal(evidence.projectRootConfirmed, true);

  updateExplorationEvidence(
    evidence,
    { id: "tc_2", name: "read_file", arguments: { path: "src/lib/math.ts" } },
    { success: true, output: "export {}" },
  );
  assert.equal(evidence.candidateFileLocated, true);
  assert.equal(evidence.entryFileRead, false);

  updateExplorationEvidence(
    evidence,
    { id: "tc_3", name: "read_file", arguments: { path: "package.json" } },
    { success: true, output: "{}" },
  );
  assert.equal(evidence.entryFileRead, true);
  assert.equal(evidence.verificationCommandKnown, true);

  updateExplorationEvidence(
    evidence,
    { id: "tc_4", name: "glob", arguments: { pattern: "**/*.ts" } },
    { success: true, output: "src/a.ts" },
  );
  assert.equal(evidence.candidateFileLocated, true);

  const before = { ...evidence };
  updateExplorationEvidence(
    evidence,
    { id: "tc_5", name: "read_file", arguments: { path: "math.ts" } },
    { success: true, output: "legacy" },
  );
  assert.deepEqual(evidence, before, "bare math.ts should not count as candidate file");

  const isolated = createEmptyExplorationEvidence();
  markProjectRootConfirmed(isolated);
  markEntryFileRead(isolated);
  markCandidateFileLocated(isolated);
  markVerificationCommandKnown(isolated);
  assert.deepEqual(isolated, {
    projectRootConfirmed: true,
    entryFileRead: true,
    candidateFileLocated: true,
    verificationCommandKnown: true,
  });
}
