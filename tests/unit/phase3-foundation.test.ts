import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentLoopController } from "@code-mind/core";
import { truncateToolOutput } from "@code-mind/execution";
import type {
  AgentProfile,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "@code-mind/shared";

class AskPatchProvider implements ModelProvider {
  name = "fake";
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
            id: "call_patch",
            name: "apply_patch",
            arguments: {
              patch: [
                "*** Begin Patch",
                "*** Update File: src/math.ts",
                "@@",
                "-  return a - b;",
                "+  return a + b;",
                "*** End Patch",
              ].join("\n"),
            },
          },
        ],
      };
    }

    return {
      text: "done",
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

export async function runPhase3FoundationTests(): Promise<void> {
  assert.match(truncateToolOutput("a".repeat(20), { maxChars: 10 }), /\.\.\.\[truncated\]/);

  const workspace = mkdtempSync(join(tmpdir(), "code-mind-phase3-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  writeFileSync(
    join(workspace, "src", "math.ts"),
    "export function add(a: number, b: number): number {\n  return a - b;\n}\n",
    "utf8",
  );

  const runtime = createAgentLoopController({
    permissionPrompter: {
      async approve() {
        return { approved: false, approvalId: "approval_1" };
      },
    },
  });
  const profile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "You are a code agent.",
  };

  await runtime.run({
    task: {
      id: "task_1",
      text: "修复测试失败",
      cwd: workspace,
      mode: "edit",
      maxSteps: 3,
    },
    profile,
    model: new AskPatchProvider(),
  });

  const runsDir = join(workspace, ".agent", "runs");
  const [runId] = readdirSync(runsDir);
  assert.ok(runId);

  const eventsLog = readFileSync(join(runsDir, runId, "events.jsonl"), "utf8");

  assert.match(eventsLog, /"kind":"permission\.decision"/);
  assert.match(eventsLog, /"decision":"ask"/);
  assert.match(eventsLog, /apply_patch/);
  assert.ok(
    eventsLog.includes('"kind":"approval.requested"') ||
      eventsLog.includes('"kind":"approval.resolved"'),
  );
}
