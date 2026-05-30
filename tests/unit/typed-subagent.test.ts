import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentLoopController,
  canEnterCollaborationPlanMode,
  createRunState,
} from "@code-mind/core";
import {
  BUILTIN_SUBAGENT_DEFINITIONS,
  getBuiltinSubagent,
  mergeSubagentDefinitions,
  SubagentManager,
  type SubagentLoopHostFactory,
} from "@code-mind/capabilities";
import type {
  AgentProfile,
  AgentSession,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "@code-mind/shared";

class SingleShotProvider implements ModelProvider {
  name = "fake-subagent";
  private readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  async chat(_request: ModelRequest): Promise<ModelResponse> {
    return {
      text: this.text,
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

export async function runTypedSubagentTests(): Promise<void> {
  assert.equal(BUILTIN_SUBAGENT_DEFINITIONS.length, 2);
  assert.ok(getBuiltinSubagent("explore"));
  assert.ok(getBuiltinSubagent("plan"));

  const merged = mergeSubagentDefinitions([
    {
      name: "explore",
      description: "custom override should win",
      tools: ["read_file"],
    },
  ]);
  assert.equal(merged.find((item) => item.name === "explore")?.description, "custom override should win");
  assert.ok(merged.find((item) => item.name === "plan"));

  const workspace = mkdtempSync(join(tmpdir(), "code-mind-subagent-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  const manager = new SubagentManager(workspace);
  const loop = createAgentLoopController();
  const hostFactory: SubagentLoopHostFactory = { getHost: () => loop };
  const profile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "You are a code agent.",
  };

  const exploreResult = await manager.run(
    {
      parentSessionId: "parent_session",
      agentName: "explore",
      task: "Find the entry file",
      maxSteps: 2,
    },
    hostFactory,
    new SingleShotProvider("Found src/index.ts"),
    profile,
  );
  assert.equal(exploreResult.success, true);
  assert.match(exploreResult.summary, /index/);

  const subagentSession: AgentSession = {
    id: exploreResult.childSessionId,
    task: {
      id: "subagent_explore",
      text: "Find the entry file",
      cwd: workspace,
      mode: "ask",
      maxSteps: 2,
      metadata: { subagent: true },
    },
    workspaceRoot: workspace,
    profile,
    modelName: "fake-subagent",
    messages: [],
    observations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { subagent: true },
  };
  const runState = createRunState(subagentSession.task);
  assert.equal(canEnterCollaborationPlanMode(runState, subagentSession), false);
}
