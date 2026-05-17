import assert from "node:assert/strict";
import { normalizeOpenAIResponse } from "../../src/model/normalizer.js";
import { OpenAICompatibleProvider } from "../../src/model/openai-compatible.js";
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
  } finally {
    globalThis.fetch = originalFetch;
  }
}
