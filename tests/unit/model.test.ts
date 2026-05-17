import assert from "node:assert/strict";
import { normalizeOpenAIResponse } from "../../src/model/normalizer.js";
import { LocalModelProvider } from "../../src/model/local.js";
import { OpenAICompatibleProvider } from "../../src/model/openai-compatible.js";
import { createModelProvider } from "../../src/model/provider.js";
import { QwenProvider } from "../../src/model/qwen.js";
import type { ModelRequest } from "../../src/shared/types.js";

export async function runModelTests(): Promise<void> {
  const normalized = normalizeOpenAIResponse({
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          content: "",
          tool_calls: [
            {
              id: "call_1",
              function: {
                name: "read_file",
                arguments: "{\"path\":\"package.json\"}",
              },
            },
          ],
        },
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    },
  });

  assert.equal(normalized.toolCalls[0]?.name, "read_file");
  assert.equal(normalized.toolCalls[0]?.arguments.path, "package.json");
  assert.equal(normalized.usage?.totalTokens, 15);

  const jsonActionNormalized = normalizeOpenAIResponse({
    choices: [
      {
        finish_reason: "stop",
        message: {
          content:
            "{\"tool_calls\":[{\"name\":\"read_file\",\"arguments\":{\"path\":\"src/math.ts\"}}]}",
        },
      },
    ],
  });
  assert.equal(jsonActionNormalized.toolCalls[0]?.name, "read_file");
  assert.equal(jsonActionNormalized.toolCalls[0]?.arguments.path, "src/math.ts");

  const originalFetch = globalThis.fetch;
  const request: ModelRequest = {
    messages: [{ id: "m1", role: "user", content: "hello", createdAt: new Date().toISOString() }],
  };

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "hi",
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const provider = new OpenAICompatibleProvider({
      name: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "test-key",
      model: "deepseek-v4-pro",
    });

    const response = await provider.chat(request);
    assert.equal(response.text, "hi");
    assert.equal(response.finishReason, "stop");

    const qwenProvider = new QwenProvider({
      name: "qwen",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "qwen-key",
      model: "qwen3-coder-plus",
    });
    const qwenResponse = await qwenProvider.chat(request);
    assert.equal(qwenResponse.text, "hi");

    const localProvider = new LocalModelProvider({
      name: "local",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "ollama",
      model: "qwen2.5-coder",
    });
    const localResponse = await localProvider.chat(request);
    assert.equal(localResponse.text, "hi");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const previousQwenApiKey = process.env.QWEN_API_KEY;
  const previousLocalModel = process.env.LOCAL_MODEL_NAME;
  try {
    process.env.QWEN_API_KEY = "qwen-key";
    process.env.LOCAL_MODEL_NAME = "qwen2.5-coder";

    const qwenBySelector = createModelProvider(
      { defaultModel: "unused", models: {} },
      "qwen:qwen3-coder-plus",
    );
    assert.equal(qwenBySelector.name, "qwen");

    const localBySelector = createModelProvider(
      { defaultModel: "unused", models: {} },
      "local:qwen2.5-coder",
    );
    assert.equal(localBySelector.name, "local");

    const providerFromConfig = createModelProvider(
      {
        defaultModel: "qwen-coder",
        models: {
          "qwen-coder": {
            provider: "qwen",
            baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
            apiKey: "qwen-key",
            model: "qwen3-coder-plus",
          },
        },
      },
    );
    assert.equal(providerFromConfig.name, "qwen-coder");
  } finally {
    if (previousQwenApiKey === undefined) {
      delete process.env.QWEN_API_KEY;
    } else {
      process.env.QWEN_API_KEY = previousQwenApiKey;
    }
    if (previousLocalModel === undefined) {
      delete process.env.LOCAL_MODEL_NAME;
    } else {
      process.env.LOCAL_MODEL_NAME = previousLocalModel;
    }
  }
}
