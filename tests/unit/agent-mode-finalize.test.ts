import assert from "node:assert/strict";
import { finalizeResult, type RunState } from "@code-mind/core";
import type { AgentResult } from "@code-mind/shared";
import { createEmptyToolActivityCounts } from "@code-mind/shared";
import { createEmptyExplorationEvidence } from "@code-mind/core";
function baseRunState(mode: RunState["progress"]["mode"]): RunState {
  const evidence = createEmptyExplorationEvidence();
  evidence.projectRootConfirmed = true;
  evidence.entryFileRead = true;
  return {
    progress: {
      mode,
      modifiedFiles: new Set<string>(),
      lastCompletedStep: 0,
      closingTurn: false,
      toolCounts: createEmptyToolActivityCounts(),
      lastActivity: "reading",
    },
    exploration: {
      evidence,
    },
    verification: {
      recoveryAttempts: 0,
    },
    budget: {
      requestedMaxSteps: 8,
      baseMaxSteps: 8,
      extraStepBudget: 0,
    },
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    planMode: { active: false },
    review: { recoveryAttempts: 0 },
  };
}

function baseResult(status: AgentResult["status"] = "success"): AgentResult {
  return {
    sessionId: "session_1",
    status,
    finalText: "done",
    steps: 3,
    modelName: "fake",
  };
}

export function runAgentModeFinalizeTests(): void {
  const askDiagnosed = finalizeResult(baseResult(), baseRunState("ask"));
  assert.equal(askDiagnosed.metadata?.completion, "diagnosed_only", "FN-01");

  const planState = baseRunState("plan");
  planState.progress.closingTurn = true;
  const planDelivered = finalizeResult(baseResult(), planState);
  assert.equal(planDelivered.metadata?.completion, "plan_delivered");

  const runState = baseRunState("edit");
  runState.progress.modifiedFiles.add("src/a.ts");
  runState.verification.lastVerification = {
    passed: true,
    summary: "ok",
    steps: [],
  };
  const verifiedEarlyStop = finalizeResult(
    baseResult("stopped_by_limit"),
    runState,
  );
  assert.equal(verifiedEarlyStop.status, "stopped_by_limit", "FN-06 factual status");
  assert.equal(verifiedEarlyStop.effectiveStatus, "success", "FN-06 effective status");
  assert.equal(verifiedEarlyStop.metadata?.completion, "modified_verified");
  assert.equal(verifiedEarlyStop.metadata?.requestedMaxSteps, 8);
  assert.equal(verifiedEarlyStop.metadata?.baseMaxSteps, 8);
  assert.equal(verifiedEarlyStop.metadata?.effectiveMaxSteps, 8);
}
