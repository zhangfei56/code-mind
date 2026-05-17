import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRuntime } from "../../src/agent/runtime.js";
import type {
  AgentProfile,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "../../src/shared/types.js";

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

  const runtime = new AgentRuntime({
    permissionPrompter: {
      async approve() {
        return true;
      },
    },
  });
  const profile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "You are a code agent.",
  };
  const provider = new FakeProvider();

  const result = await runtime.run({
    task: {
      id: "task_1",
      text: "修复测试失败",
      cwd: workspace,
      mode: "suggest",
      maxSteps: 8,
    },
    profile,
    model: provider,
  });

  const updated = readFileSync(join(workspace, "src", "math.ts"), "utf8");
  assert.equal(result.status, "success");
  assert.match(result.finalText, /tests passed/i);
  assert.match(updated, /a \+ b/);
}
