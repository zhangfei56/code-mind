import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentLoopController } from "@code-mind/core";
import type {
  AgentProfile,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "@code-mind/shared";

class PathErrorRecoveryProvider implements ModelProvider {
  name = "deepseek";
  private step = 0;

  async chat(request: ModelRequest): Promise<ModelResponse> {
    this.step += 1;

    if (this.step === 1) {
      return {
        text: "",
        finishReason: "tool_call",
        raw: {},
        toolCalls: [
          {
            id: "call_bad_path",
            name: "read_file",
            arguments: { path: "/tmp/outside-workspace.txt" },
          },
        ],
      };
    }

    const toolMessages = request.messages.filter((message) => message.role === "tool");
    assert.match(toolMessages[toolMessages.length - 1]?.content ?? "", /Path escapes workspace/);

    return {
      text: "Recovered from tool path error and continued.",
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
      reasoning: true,
      maxContextTokens: 100000,
      maxOutputTokens: 8000,
      supportsPromptCache: false,
      supportsComputerUse: false,
    };
  }
}

class EmptySummaryProvider implements ModelProvider {
  name = "deepseek";

  async chat(request: ModelRequest): Promise<ModelResponse> {
    const toolMessages = request.messages.filter((message) => message.role === "tool");
    if (toolMessages.length === 0) {
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

    return {
      text: "",
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
      reasoning: true,
      maxContextTokens: 100000,
      maxOutputTokens: 8000,
      supportsPromptCache: false,
      supportsComputerUse: false,
    };
  }
}

export async function runRuntimeStabilityTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-runtime-stability-"));
  const runtime = createAgentLoopController();
  const profile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "You are a code agent.",
  };

  const result = await runtime.run({
    task: {
      id: "task_1",
      text: "分析这个项目",
      cwd: workspace,
      mode: "ask",
      maxSteps: 4,
    },
    profile,
    model: new PathErrorRecoveryProvider(),
  });

  assert.equal(result.status, "success");
  assert.match(result.finalText, /Recovered from tool path error/);

  const fallbackSummaryResult = await runtime.run({
    task: {
      id: "task_2",
      text: "请分析这个项目",
      cwd: workspace,
      mode: "ask",
      maxSteps: 3,
    },
    profile,
    model: new EmptySummaryProvider(),
  });

  assert.equal(fallbackSummaryResult.status, "incomplete");
  assert.match(
    fallbackSummaryResult.finalText,
    /The model did not produce a plain-text final summary/,
  );
}
