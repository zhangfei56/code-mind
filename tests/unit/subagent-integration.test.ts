import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeAgentLoop } from "@code-mind/agent-composition";
import { resolveSubagentMaxSteps, getBuiltinSubagent } from "@code-mind/capabilities";
import type {
  AgentProfile,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  AgentEvent,
} from "@code-mind/shared";

class SubagentIntegrationProvider implements ModelProvider {
  name = "fake-subagent-integration";
  private calls = 0;

  async chat(_request: ModelRequest): Promise<ModelResponse> {
    this.calls += 1;
    if (this.calls === 1) {
      return {
        text: "",
        finishReason: "tool_call",
        raw: {},
        toolCalls: [
          {
            id: "call_spawn_explore",
            name: "run_subagent",
            arguments: {
              agentName: "explore",
              task: "Find the CLI entry file path",
            },
          },
        ],
      };
    }
    if (this.calls === 2) {
      return {
        text: "## Findings\n- Entry at apps/cli/src/cli/index.ts\n\n## Recommendation\nUse this path.",
        finishReason: "stop",
        raw: {},
        toolCalls: [],
      };
    }
    return {
      text: "The CLI entry is apps/cli/src/cli/index.ts.",
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

export async function runSubagentIntegrationTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-subagent-int-"));
  mkdirSync(join(workspace, "apps", "cli", "src", "cli"), { recursive: true });

  const profile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "You are a code agent.",
  };
  const model = new SubagentIntegrationProvider();
  const { loop } = await composeAgentLoop(workspace, { model, profile });

  const events: AgentEvent[] = [];
  const result = await loop.run({
    task: {
      id: "task_subagent_integration",
      text: "Where is the CLI entry?",
      cwd: workspace,
      mode: "edit",
      maxSteps: 6,
    },
    profile,
    model,
    onEvent(event) {
      events.push(event);
    },
  });

  assert.equal(result.status, "success");
  assert.ok(events.some((event) => event.kind === "subagent.spawned"));
  assert.ok(events.some((event) => event.kind === "subagent.finished"));
  assert.equal(
    events.some((event) => event.kind === "approval.requested"),
    false,
    "explore spawn should not require approval",
  );

  const explore = getBuiltinSubagent("explore");
  assert.ok(explore);
  assert.equal(resolveSubagentMaxSteps(explore!, 99), 6);
  assert.equal(resolveSubagentMaxSteps(explore!, undefined), 4);
}
