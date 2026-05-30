import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentLoopController, createAgentLoopController } from "@code-mind/core";
import type {
  AgentProfile,
  AgentMode,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  AgentEvent,
} from "@code-mind/shared";

class ScriptedProvider implements ModelProvider {
  name = "scripted";
  private step = 0;

  constructor(private readonly script: Array<() => ModelResponse>) {}

  async chat(_request: ModelRequest): Promise<ModelResponse> {
    const response = this.script[this.step];
    this.step += 1;
    if (!response) {
      throw new Error(`Unexpected model call at step ${this.step}`);
    }
    return response();
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

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-mode-runtime-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  writeFileSync(
    join(workspace, "src", "math.ts"),
    "export function add(a: number, b: number): number {\n  return a + b;\n}\n",
    "utf8",
  );
  return workspace;
}

const profile: AgentProfile = {
  id: "default",
  name: "Default",
  systemPrompt: "You are a code agent.",
};

async function runWithMode(
  mode: AgentMode,
  provider: ModelProvider,
): Promise<{ result: Awaited<ReturnType<AgentLoopController["run"]>>; events: AgentEvent[] }> {
  const workspace = createWorkspace();
  const events: AgentEvent[] = [];
  const runtime = createAgentLoopController({
    permissionPrompter: {
      async approve() {
        return { approved: true, approvalId: "approval_1" };
      },
    },
  });

  const result = await runtime.run({
    task: {
      id: "task_mode",
      text: mode === "ask" ? "请修复测试失败" : "inspect file",
      cwd: workspace,
      mode,
      maxSteps: 4,
    },
    profile,
    model: provider,
    onEvent(event) {
      events.push(event);
    },
  });

  return { result, events };
}

export async function runAgentModeRuntimeTests(): Promise<void> {
  const askReadProvider = new ScriptedProvider([
    () => ({
      text: "",
      finishReason: "tool_call",
      raw: {},
      toolCalls: [
        {
          id: "call_read",
          name: "read_file",
          arguments: { path: "src/math.ts" },
        },
      ],
    }),
    () => ({
      text: "Project uses src/math.ts as entry.",
      finishReason: "stop",
      raw: {},
      toolCalls: [],
    }),
  ]);

  const askReadRun = await runWithMode("ask", askReadProvider);
  const turnStarted = askReadRun.events.find((event) => event.kind === "turn.started");
  assert.equal((turnStarted?.payload as { mode?: string }).mode, "ask", "RT-01");
  assert.equal(askReadRun.result.metadata?.completion, "diagnosed_only", "RT-03");
  assert.equal(
    askReadRun.events.some(
      (event) => event.kind === "tool.call" && (event.payload as { toolCall?: { name?: string } }).toolCall?.name === "apply_patch",
    ),
    false,
  );

  const askPatchProvider = new ScriptedProvider([
    () => ({
      text: "",
      finishReason: "tool_call",
      raw: {},
      toolCalls: [
        {
          id: "call_patch",
          name: "apply_patch",
          arguments: {
            patch: [
              "*** Begin Patch",
              "*** Update File: src/math.ts",
              "@@",
              "-  return a + b;",
              "+  return a - b;",
              "*** End Patch",
            ].join("\n"),
          },
        },
      ],
    }),
  ]);

  const askPatchRun = await runWithMode("ask", askPatchProvider);
  assert.equal(askPatchRun.result.status, "permission_denied", "RT-02");
}
