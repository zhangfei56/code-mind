import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentLoopController,
  executeFromApprovedPlan,
  getEffectiveResultStatus,
  isAgentRunSuccessful,
  runAgentSession,
} from "@code-mind/core";
import { createTestSessionStore } from "./helpers/session-store.js";
import type {
  AgentProfile,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "@code-mind/shared";

class CountingProvider implements ModelProvider {
  name = "fake";
  calls = 0;

  async chat(_request: ModelRequest): Promise<ModelResponse> {
    this.calls += 1;
    return {
      text: this.calls === 1 ? "1. Analyze\n2. Patch\n3. Verify" : "execution done",
      finishReason: "stop",
      raw: {},
      toolCalls: [],
    };
  }

  getCapabilities(): ModelCapabilities {
    return {
      toolCall: true,
      parallelToolCall: false,
      jsonSchema: true,
      vision: false,
      reasoning: false,
      maxContextTokens: 100000,
      maxOutputTokens: 8000,
      supportsPromptCache: false,
      supportsComputerUse: false,
    };
  }
}

export async function runPlanSessionTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-plan-session-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  const loop = createAgentLoopController();
  const profile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "You are a code agent.",
  };
  const provider = new CountingProvider();
  const store = createTestSessionStore(workspace);

  const planned = await runAgentSession({
    task: {
      id: "task_2",
      text: "fix bug",
      cwd: workspace,
      mode: "edit",
      maxSteps: 6,
    },
    profile,
    model: provider,
    loop,
    workspaceRoot: workspace,
    planFirst: true,
    autoApprovePlan: true,
  });

  assert.ok(planned.planResult);
  assert.notEqual(planned.planResult.sessionId, planned.result.sessionId);

  const planManifest = await store.readManifest(planned.planResult.sessionId);
  const executeManifest = await store.readManifest(planned.result.sessionId);
  assert.equal(planManifest.sessionRole, "plan");
  assert.equal(executeManifest.sessionRole, "execute");
  assert.equal(planManifest.executeSessionId, planned.result.sessionId);
  assert.equal(executeManifest.planSessionId, planned.planResult.sessionId);

  const planArtifact = await store.readPlan(planned.planResult.sessionId);
  assert.ok(planArtifact);
  assert.match(planArtifact.markdown, /Analyze/);

  const rejectedWorkspace = mkdtempSync(join(tmpdir(), "code-mind-plan-rejected-"));
  mkdirSync(join(rejectedWorkspace, "src"), { recursive: true });
  const rejected = await runAgentSession({
    task: {
      id: "task_plan_rejected",
      text: "fix with approval",
      cwd: rejectedWorkspace,
      mode: "edit",
      maxSteps: 6,
    },
    profile,
    model: new CountingProvider(),
    loop: createAgentLoopController(),
    workspaceRoot: rejectedWorkspace,
    planFirst: true,
    approvePlan: async () => false,
  });
  assert.equal(rejected.result.status, "permission_denied");
  assert.equal(getEffectiveResultStatus(rejected.result), "permission_denied");
  assert.equal(isAgentRunSuccessful(rejected.result), false);

  // Standalone execute from approved plan (plan-only session without auto-execute)
  const planOnlyWorkspace = mkdtempSync(join(tmpdir(), "code-mind-plan-only-"));
  mkdirSync(join(planOnlyWorkspace, "src"), { recursive: true });
  const planOnlyStore = createTestSessionStore(planOnlyWorkspace);
  const planOnlyProvider = new CountingProvider();
  const planOnly = await runAgentSession({
    task: {
      id: "task_plan_only",
      text: "plan only task",
      cwd: planOnlyWorkspace,
      mode: "plan",
      maxSteps: 4,
    },
    profile,
    model: planOnlyProvider,
    loop: createAgentLoopController(),
    workspaceRoot: planOnlyWorkspace,
  });
  await planOnlyStore.updateManifest(planOnly.result.sessionId, {
    sessionRole: "plan",
  });

  const executed = await executeFromApprovedPlan({
    planSessionId: planOnly.result.sessionId,
    executionMode: "edit",
    profile,
    model: new CountingProvider(),
    loop: createAgentLoopController(),
    workspaceRoot: planOnlyWorkspace,
  });

  assert.notEqual(executed.result.sessionId, planOnly.result.sessionId);
  const linkedPlan = await planOnlyStore.readManifest(planOnly.result.sessionId);
  const linkedExecute = await planOnlyStore.readManifest(executed.result.sessionId);
  assert.equal(linkedPlan.executeSessionId, executed.result.sessionId);
  assert.equal(linkedExecute.planSessionId, planOnly.result.sessionId);
}
