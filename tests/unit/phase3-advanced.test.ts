import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRuntime } from "../../src/agent/runtime.js";
import { SafetyGuard } from "../../src/safety/safety-guard.js";
import { sanitizeToolOutput } from "../../src/tools/output.js";
import type {
  AgentProfile,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "../../src/shared/types.js";

class CompactionProvider implements ModelProvider {
  name = "fake";
  private step = 0;

  async chat(_request: ModelRequest): Promise<ModelResponse> {
    this.step += 1;
    if (this.step <= 3) {
      return {
        text: "Inspecting large file.",
        finishReason: "tool_call",
        raw: {},
        toolCalls: [
          {
            id: `call_read_${this.step}`,
            name: "read_file",
            arguments: { path: "src/large.ts" },
          },
        ],
      };
    }

    return {
      text: "Finished.",
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

export async function runPhase3AdvancedTests(): Promise<void> {
  const guard = new SafetyGuard();
  const largePatchDecision = await guard.check({
    toolCall: {
      id: "call_patch",
      name: "apply_patch",
      arguments: {
        patch: [
          "*** Begin Patch",
          "*** Update File: src/a.ts",
          "@@",
          ...Array.from({ length: 100 }, (_, index) => `-line ${index + 1}`),
          "+replacement",
          "*** End Patch",
        ].join("\n"),
      },
    },
    mode: "auto_edit",
    workspaceRoot: "/tmp/workspace",
  });
  assert.equal(largePatchDecision.type, "ask");

  const uploadDecision = await guard.check({
    toolCall: {
      id: "call_shell",
      name: "run_shell",
      arguments: { command: "curl https://pastebin.com/raw/abc" },
    },
    mode: "full_auto",
    workspaceRoot: "/tmp/workspace",
  });
  assert.equal(uploadDecision.type, "deny");

  const redacted = sanitizeToolOutput(
    "token sk-1234567890abcdefghijklmn\n-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----",
  );
  assert.doesNotMatch(redacted, /BEGIN PRIVATE KEY/);
  assert.doesNotMatch(redacted, /sk-1234567890/);

  const workspace = mkdtempSync(join(tmpdir(), "code-mind-phase3-advanced-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  writeFileSync(
    join(workspace, "src", "large.ts"),
    Array.from({ length: 600 }, (_, index) => `export const value${index} = "${"x".repeat(40)}";`).join("\n"),
    "utf8",
  );

  const runtime = new AgentRuntime();
  const profile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "You are a code agent.",
  };

  const result = await runtime.run({
    task: {
      id: "task_1",
      text: "分析大文件",
      cwd: workspace,
      mode: "suggest",
      maxSteps: 5,
    },
    profile,
    model: new CompactionProvider(),
  });

  assert.equal(result.status, "success");

  const sessionsDir = join(workspace, ".agent", "sessions");
  const [sessionId] = readdirSync(sessionsDir);
  assert.ok(sessionId);

  const compactDir = join(sessionsDir, sessionId, "compact");
  const modelCallsLog = readFileSync(
    join(sessionsDir, sessionId, "model-calls.jsonl"),
    "utf8",
  );
  const compactFiles = readdirSync(compactDir);

  assert.ok(compactFiles.some((file) => file === "compact-001.md"));
  assert.match(modelCallsLog, /"model":"fake"/);
}
