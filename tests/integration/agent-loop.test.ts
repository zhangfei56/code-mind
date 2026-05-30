import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentLoopController } from "@code-mind/core";
import { createTestSessionStore } from "../unit/helpers/session-store.js";
import type {
  AgentProfile,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  AgentEvent,
  VerificationResult,
} from "@code-mind/shared";
import { VerificationPipeline } from "@code-mind/verify";
import type { VerificationOptions } from "@code-mind/verify";

class PatchThenStopProvider implements ModelProvider {
  name = "fake-integration";
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
      text: "Patch applied.",
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

class PassingVerificationPipeline extends VerificationPipeline {
  override async run(
    _projectPath: string,
    _options: VerificationOptions = {},
  ): Promise<VerificationResult> {
    return {
      passed: true,
      summary: "tests passed",
      steps: [{ name: "test", success: true, summary: "ok" }],
    };
  }
}

function setupWorkspace(prefix: string): string {
  const workspace = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(workspace, "src"), { recursive: true });
  return workspace;
}

async function readJsonl(
  path: string,
): Promise<Array<{ type?: string; payload?: Record<string, unknown> }>> {
  try {
    const content = readFileSync(path, "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as { type?: string; payload?: Record<string, unknown> });
  } catch {
    return [];
  }
}

export async function runVerificationEventsTests(): Promise<void> {
  const workspace = setupWorkspace("code-mind-verify-events-");
  writeFileSync(
    join(workspace, "src", "math.ts"),
    "export function add(a: number, b: number): number {\n  return a - b;\n}\n",
    "utf8",
  );

  const events: AgentEvent[] = [];
  const loop = createAgentLoopController({
    verificationPipeline: new PassingVerificationPipeline(),
    permissionPrompter: {
      async approve() {
        return { approved: true, approvalId: "approval_1" };
      },
    },
  });

  await loop.run({
    task: {
      id: "task_1",
      text: "fix math",
      cwd: workspace,
      mode: "edit",
      maxSteps: 5,
    },
    profile: {
      id: "default",
      name: "Default",
      systemPrompt: "demo",
    },
    model: new PatchThenStopProvider(),
    onEvent(event) {
      events.push(event);
    },
  });

  assert.ok(events.some((event) => event.kind === "verification.started"));
  assert.ok(events.some((event) => event.kind === "verification.finished"));
  assert.equal(
    events.some(
      (event) =>
        event.kind === "tool.call" && (event.payload as { toolCall?: { name?: string } }).toolCall?.name === "verify_project",
    ),
    false,
  );
}

export async function runAgentLoopIntegrationTests(): Promise<void> {
  const workspace = setupWorkspace("code-mind-integration-");
  writeFileSync(
    join(workspace, "src", "math.ts"),
    "export function add(a: number, b: number): number {\n  return a - b;\n",
    "utf8",
  );

  const loop = createAgentLoopController({
    verificationPipeline: new PassingVerificationPipeline(),
    permissionPrompter: {
      async approve() {
        return { approved: true, approvalId: "approval_1" };
      },
    },
  });
  const profile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "You are a code agent.",
  };

  const result = await loop.run({
    task: {
      id: "task_1",
      text: "fix addition",
      cwd: workspace,
      mode: "edit",
      maxSteps: 6,
    },
    profile,
    model: new PatchThenStopProvider(),
  });

  assert.equal(result.status, "success");
  assert.match(readFileSync(join(workspace, "src", "math.ts"), "utf8"), /a \+ b/);

  const events = await readJsonl(
    join(workspace, ".agent", "runs", result.runId, "events.jsonl"),
  );
  assert.equal(
    events.some(
      (record) =>
        record.kind === "tool.call" &&
        (record.payload as { toolCall?: { name?: string } })?.toolCall?.name ===
          "verify_project",
    ),
    false,
  );
  assert.ok(events.some((record) => record.kind === "verification.finished"));

  const store = createTestSessionStore(workspace);
  const verification = readFileSync(
    join(store.getSessionDir(result.sessionId), "verification.json"),
    "utf8",
  );
  assert.match(verification, /"passed": true/);
  const review = readFileSync(
    join(store.getSessionDir(result.sessionId), "review.json"),
    "utf8",
  );
  assert.match(review, /"passed": true/);
  assert.match(review, /Source files changed without matching test updates/);

  const restored = await store.restoreSession(result.sessionId, profile);
  assert.ok(
    restored.messages.some(
      (message) => message.role === "user" && message.content.includes("[Verification passed]"),
    ),
  );
}
