import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentLoopController } from "@code-mind/core";
import type { VerificationOptions } from "@code-mind/verify";
import type {
  AgentProfile,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  AgentEvent,
} from "@code-mind/shared";

class FakeProvider implements ModelProvider {
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
            id: "call_read",
            name: "read_file",
            arguments: { path: "src/math.ts" },
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

    if (this.step === 3) {
      return {
        text: "",
        finishReason: "tool_call",
        raw: {},
        toolCalls: [
          {
            id: "call_test",
            name: "run_shell",
            arguments: { command: "npm test", timeoutMs: 20000 },
          },
        ],
      };
    }

    return {
      text: "Bug fixed and tests passed.",
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

class PassingVerificationPipeline {
  async run(_projectPath: string, _options: VerificationOptions = {}) {
    return {
      passed: true,
      summary: "passed",
      steps: [{ name: "test", success: true, summary: "passed" }],
    };
  }
}

export async function runRuntimeTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-runtime-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  writeFileSync(
    join(workspace, "package.json"),
    JSON.stringify({
      name: "runtime-demo",
      private: true,
      type: "module",
      scripts: { test: "node test.js" },
    }),
    "utf8",
  );
  writeFileSync(
    join(workspace, "src", "math.ts"),
    "export function add(a: number, b: number): number {\n  return a - b;\n}\n",
    "utf8",
  );
  writeFileSync(
    join(workspace, "test.js"),
    [
      "import assert from 'node:assert/strict';",
      "import { readFileSync } from 'node:fs';",
      "import vm from 'node:vm';",
      "const source = readFileSync(new URL('./src/math.ts', import.meta.url), 'utf8').replace(/export\\s+/g, '').replace(/: number/g, '');",
      "const context = {};",
      "vm.createContext(context);",
      "vm.runInContext(`${source}; globalThis.add = add;`, context);",
      "assert.equal(context.add(1, 2), 3);",
      "console.log('tests passed');",
    ].join("\n"),
    "utf8",
  );

  const runtime = createAgentLoopController({
    verificationPipeline: new PassingVerificationPipeline(),
    reviewEngine: {
      review: () => ({
        passed: true,
        issues: [],
        suggestions: [],
        requiresAnotherIteration: false,
      }),
    } as never,
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
  const provider = new FakeProvider();
  const events: AgentEvent[] = [];

  const result = await runtime.run({
    task: {
      id: "task_1",
      text: "修复测试失败",
      cwd: workspace,
      mode: "edit",
      maxSteps: 8,
    },
    profile,
    model: provider,
    onEvent(event) {
      events.push(event);
    },
  });

  const updated = readFileSync(join(workspace, "src", "math.ts"), "utf8");
  assert.equal(result.status, "success");
  assert.match(result.finalText, /tests passed/i);
  assert.match(updated, /a \+ b/);
  assert.equal(result.metadata?.completion, "modified_verified");
  assert.ok(events.some((event) => event.kind === "turn.started"));
  assert.equal(events.some((event) => event.kind === "activity.updated"), true);
  assert.equal(events.some((event) => event.kind === "model.request"), true);
  assert.equal(
    events.some(
      (event) => event.kind === "tool.call" && (event.payload as { toolCall?: { name?: string } }).toolCall?.name === "read_file",
    ),
    true,
  );
  assert.equal(
    events.some((event) => event.kind === "verification.started"),
    true,
  );
  assert.equal(
    events.some((event) => event.kind === "verification.finished"),
    true,
  );
  assert.equal(
    events.some(
      (event) => event.kind === "tool.call" && (event.payload as { toolCall?: { name?: string } }).toolCall?.name === "verify_project",
    ),
    false,
  );
  assert.ok(events.some((event) => event.kind === "run.finished"));
  assert.ok(events.some((event) => event.kind === "kernel.transition"));

  await runRuntimeCancelStepTests();
}

class SingleToolProvider implements ModelProvider {
  name = "single-tool";

  async chat(_request: ModelRequest): Promise<ModelResponse> {
    return {
      text: "",
      finishReason: "tool_call",
      raw: {},
      toolCalls: [
        {
          id: "call_list",
          name: "list_dir",
          arguments: { path: "." },
        },
      ],
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

async function runRuntimeCancelStepTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-runtime-cancel-"));
  const abortController = new AbortController();
  const runtime = createAgentLoopController();
  const profile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "You are a code agent.",
  };

  const result = await runtime.run({
    task: {
      id: "task_cancel",
      text: "inspect project",
      cwd: workspace,
      mode: "ask",
      maxSteps: 5,
    },
    profile,
    model: new SingleToolProvider(),
    abortSignal: abortController.signal,
    onEvent(event) {
      if (event.kind === "step.started" && (event.payload as { step?: number }).step === 2) {
        abortController.abort();
      }
    },
  });

  assert.equal(result.status, "cancelled");
  assert.equal(result.steps, 2);
}
