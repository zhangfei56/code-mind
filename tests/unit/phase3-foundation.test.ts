import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRuntime } from "../../src/agent/runtime.js";
import { truncateToolOutput } from "../../src/tools/output.js";
import type {
  AgentProfile,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "../../src/shared/types.js";

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

  const runtime = new AgentRuntime({
    permissionPrompter: {
      async approve() {
        return false;
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
      mode: "suggest",
      maxSteps: 3,
    },
    profile,
    model: new AskPatchProvider(),
  });

  const sessionsDir = join(workspace, ".agent", "sessions");
  const [sessionId] = readdirSync(sessionsDir);
  assert.ok(sessionId);

  const permissionLog = readFileSync(
    join(sessionsDir, sessionId, "permission-decisions.jsonl"),
    "utf8",
  );
  const auditLog = readFileSync(
    join(sessionsDir, sessionId, "audit.jsonl"),
    "utf8",
  );

  assert.match(permissionLog, /"decision":"ask"/);
  assert.match(auditLog, /"type":"permission_decision"/);
  assert.match(auditLog, /"type":"user_approval"/);
}
