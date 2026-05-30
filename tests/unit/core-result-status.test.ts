import assert from "node:assert/strict";
import { attachRejectionMetadata } from "@code-mind/core";
import type { AgentResult } from "@code-mind/shared";

export function runCoreResultStatusTests(): void {
  const base: AgentResult = {
    sessionId: "session_1",
    status: "permission_denied",
    finalText: "denied",
    steps: 1,
    modelName: "local",
  };

  const updated = attachRejectionMetadata(base, {
    rejectionSource: "permission",
    rejectionKind: "policy_denied",
  });

  assert.equal(updated.metadata?.rejectionSource, "permission");
  assert.equal(updated.metadata?.rejectionKind, "policy_denied");
  assert.equal(updated.status, "permission_denied");
}
