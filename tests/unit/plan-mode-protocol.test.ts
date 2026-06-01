import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentLoopController,
  createLoopPolicy,
  createRunState,
  getCollaborationToolSchemas,
  isPlanDraftPath,
  registerPlanModeTools,
  resolvePlanDraftRelativePath,
  selectToolSchemasForModel,
} from "@code-mind/core";
import { createTestSessionStore } from "./helpers/session-store.js";
import { PermissionEngine } from "@code-mind/security";
import { ToolRegistry, registerDefaultTools } from "@code-mind/execution";
import type {
  AgentProfile,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ToolCall,
} from "@code-mind/shared";
class PlanModeProvider implements ModelProvider {
  name = "fake-plan";
  private step = 0;

  async chat(_request: ModelRequest): Promise<ModelResponse> {
    this.step += 1;
    if (this.step === 1) {
      return {
        text: "",
        finishReason: "tool_call",
        raw: {},
        toolCalls: [
          {
            id: "call_enter",
            name: "enter_plan_mode",
            arguments: { reason: "complex task" },
          },
        ],
      };
    }
    if (this.step === 2) {
      return {
        text: "",
        finishReason: "tool_call",
        raw: {},
        toolCalls: [
          {
            id: "call_exit",
            name: "exit_plan_mode",
            arguments: { planText: "1. Read files\n2. Apply fix\n3. Verify" },
          },
        ],
      };
    }
    return {
      text: "Implementation complete.",
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

export async function runPlanModeProtocolTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-plan-mode-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  const loop = createAgentLoopController();
  const profile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "You are a code agent.",
  };
  const events: string[] = [];

  const result = await loop.run({
    task: {
      id: "task_plan_mode",
      text: "Refactor auth middleware",
      cwd: workspace,
      mode: "edit",
      maxSteps: 6,
    },
    profile,
    model: new PlanModeProvider(),
    autoApprovePlan: true,
    onEvent(event) {
      events.push(event.kind);
    },
  });

  assert.equal(result.status, "success");
  assert.ok(events.includes("plan.entered"));
  assert.ok(events.includes("plan.exited"));
  assert.ok(events.includes("mode.changed"));

  const store = createTestSessionStore(workspace);
  const plan = await store.readPlan(result.sessionId);
  assert.ok(plan);
  assert.match(plan.markdown, /Apply fix/);

  const draftRelative = resolvePlanDraftRelativePath(workspace, result.sessionId);
  const engine = new PermissionEngine();
  const denied = await engine.check({
    toolCall: {
      id: "call_patch",
      name: "apply_patch",
      arguments: {
        patch: `*** Begin Patch
*** Update File: src/auth.ts
@@
+const x = 1;
*** End Patch`,
      },
    },
    mode: "plan",
    workspaceRoot: workspace,
    planModeActive: true,
    planDraftRelativePath: draftRelative,
  });
  assert.equal(denied.type, "deny");

  const patch = `*** Begin Patch
*** Update File: ${draftRelative}
@@
+# Plan
+1. step
*** End Patch`;
  const allowed = await engine.check({
    toolCall: {
      id: "call_patch_plan",
      name: "apply_patch",
      arguments: { patch },
    },
    mode: "plan",
    workspaceRoot: workspace,
    planModeActive: true,
    planDraftRelativePath: draftRelative,
  });
  assert.equal(allowed.type, "allow");
  assert.equal(isPlanDraftPath(workspace, result.sessionId, draftRelative), true);

  const registry = new ToolRegistry();
  registerDefaultTools(registry);
  registerPlanModeTools(registry);
  const assertUniqueSchemas = (mode: "edit" | "plan", planActive: boolean): void => {
    const runState = createRunState({
      id: "task_unique_tools",
      text: "test",
      cwd: workspace,
      mode,
      maxSteps: 12,
    });
    if (planActive) {
      runState.planMode = { active: true, preMode: "edit" };
    }
    const names = getCollaborationToolSchemas(registry, runState).map((schema) => schema.name);
    assert.equal(
      new Set(names).size,
      names.length,
      `tool schemas must be unique (${mode}, planActive=${planActive})`,
    );
  };
  assertUniqueSchemas("edit", false);
  assertUniqueSchemas("plan", true);

  const editTask = {
    id: "task_select_tools",
    text: "fix src/math.ts only",
    cwd: workspace,
    mode: "edit" as const,
    maxSteps: 12,
  };
  const editRunState = createRunState(editTask);
  const strategy = createLoopPolicy(editTask, workspace);
  const selected = selectToolSchemasForModel(registry, editRunState, {
    enterClosingTurn: false,
    task: editTask,
    workspaceRoot: workspace,
    strategy,
  });
  assert.equal(selected.trigger, "runtime_mode");
  assert.equal(selected.reason, "Tools selected for active runtime mode.");
  assert.equal(selected.mode, "edit");
  assert.ok(selected.tools.some((schema) => schema.name === "enter_plan_mode"));

  const closingSelection = selectToolSchemasForModel(registry, editRunState, {
    enterClosingTurn: true,
    task: editTask,
    workspaceRoot: workspace,
    strategy,
  });
  assert.equal(closingSelection.trigger, "closing_turn");
  assert.equal(closingSelection.reason, "Closing turn disables tool schemas.");
  assert.deepEqual(closingSelection.tools, []);
}
