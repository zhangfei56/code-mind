import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentLoopController, runAgentSession } from "@code-mind/core";
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
      text: this.calls === 1 ? "plan step 1" : "execution done",
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

export async function runRunSessionTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-run-session-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  const loop = createAgentLoopController();
  const profile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "You are a code agent.",
  };
  const provider = new CountingProvider();

  const single = await runAgentSession({
    task: {
      id: "task_1",
      text: "analyze",
      cwd: workspace,
      mode: "ask",
      maxSteps: 4,
    },
    profile,
    model: provider,
    loop,
    workspaceRoot: workspace,
  });
  assert.equal(single.planResult, undefined);
  assert.equal(provider.calls, 1);

  provider.calls = 0;
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
  assert.equal(planned.planResult?.status, "success");
  assert.equal(planned.result.status, "success");
  assert.equal(provider.calls, 2);
  assert.match(planned.task.text, /## Plan/);
  assert.equal(planned.task.mode, "edit");
  assert.notEqual(planned.planResult.sessionId, planned.result.sessionId);
}
