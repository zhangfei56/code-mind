import assert from "node:assert/strict";
import {
  normalizeOpenAIResponse,
  stripDsmlToolCallMarkup,
} from "@code-mind/models";
import { LocalModelProvider } from "@code-mind/models";
import { OpenAICompatibleProvider } from "@code-mind/models";
import { createModelProvider } from "@code-mind/models";
import { QwenProvider } from "@code-mind/models";
import { getDefaultTimeoutMs } from "@code-mind/models";
import type { ModelRequest } from "@code-mind/shared";

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

  const cached = normalizeOpenAIResponse({
    choices: [{ finish_reason: "stop", message: { content: "ok" } }],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 10,
      total_tokens: 110,
      prompt_tokens_details: { cached_tokens: 75 },
    },
  });
  assert.equal(cached.usage?.cachedInputTokens, 75);
  assert.equal(cached.usage?.uncachedInputTokens, 25);

  const deepseekCached = normalizeOpenAIResponse({
    choices: [{ finish_reason: "stop", message: { content: "ok" } }],
    usage: {
      prompt_tokens: 5120,
      completion_tokens: 80,
      total_tokens: 5200,
      prompt_cache_hit_tokens: 4000,
      prompt_cache_miss_tokens: 1120,
    },
  });
  assert.equal(deepseekCached.usage?.cachedInputTokens, 4000);
  assert.equal(deepseekCached.usage?.uncachedInputTokens, 1120);

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

  const dsmlNormalized = normalizeOpenAIResponse({
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: [
            "<｜｜DSML｜｜tool_calls>",
            "<｜｜DSML｜｜invoke name=\"read\">",
            "<｜｜DSML｜｜parameter name=\"path\" string=\"true\">package.json</｜｜DSML｜｜parameter>",
            "</｜｜DSML｜｜invoke>",
            "<｜｜DSML｜｜invoke name=\"list_dir\">",
            "<｜｜DSML｜｜parameter name=\"path\" string=\"true\">tests</｜｜DSML｜｜parameter>",
            "<｜｜DSML｜｜parameter name=\"depth\" string=\"false\">2</｜｜DSML｜｜parameter>",
            "</｜｜DSML｜｜invoke>",
            "</｜｜DSML｜｜tool_calls>",
          ].join("\n"),
        },
      },
    ],
  });
  assert.equal(dsmlNormalized.toolCalls.length, 2);
  assert.equal(dsmlNormalized.toolCalls[0]?.name, "read_file");
  assert.equal(dsmlNormalized.toolCalls[0]?.arguments.path, "package.json");
  assert.equal(dsmlNormalized.toolCalls[1]?.name, "list_dir");
  assert.equal(dsmlNormalized.toolCalls[1]?.arguments.depth, 2);

  const dsmlWithInvokeMetadata = normalizeOpenAIResponse({
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: [
            "先执行测试。",
            "<｜｜DSML｜｜tool_calls>",
            "<｜｜DSML｜｜invoke name=\"run_shell\" @=\"431862731bfc4816b293ccde1ccbf5ff\">",
            "<｜｜DSML｜｜parameter name=\"command\" string=\"true\">npm test</｜｜DSML｜｜parameter>",
            "<｜｜DSML｜｜parameter name=\"timeout\" string=\"false\">10000</｜｜DSML｜｜parameter>",
            "</｜｜DSML｜｜invoke>",
            "</｜｜DSML｜｜tool_calls>",
          ].join("\n"),
        },
      },
    ],
  });
  assert.equal(dsmlWithInvokeMetadata.toolCalls[0]?.name, "run_shell");
  assert.equal(dsmlWithInvokeMetadata.toolCalls[0]?.arguments.command, "npm test");
  assert.equal(dsmlWithInvokeMetadata.toolCalls[0]?.arguments.timeout, 10000);
  assert.equal(
    stripDsmlToolCallMarkup("before\n<｜｜DSML｜｜tool_calls>\nabc\n</｜｜DSML｜｜tool_calls>\nafter"),
    "before\nafter",
  );

  const streamedDsml = [
    "<",
    "｜｜DSML｜｜",
    "tool",
    "_c",
    "alls",
    ">",
    "<",
    "｜｜DSML｜｜",
    "inv",
    "oke",
    ' name="read_file">',
    "<",
    "｜｜DSML｜｜",
    "parameter",
    ' name="path"',
    ' string="true">',
    "packages/config/src/load-config.ts",
    "</",
    "｜｜DSML｜｜",
    "parameter",
    ">",
    "</",
    "｜｜DSML｜｜",
    "inv",
    "oke",
    ">",
    "</",
    "｜｜DSML｜｜",
    "tool",
    "_c",
    "alls",
    ">",
  ].join("\n");
  assert.equal(stripDsmlToolCallMarkup(streamedDsml), "");
  const streamedDsmlNormalized = normalizeOpenAIResponse({
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: streamedDsml,
        },
      },
    ],
  });
  assert.equal(streamedDsmlNormalized.text, "");
  assert.equal(streamedDsmlNormalized.toolCalls[0]?.name, "read_file");
  assert.equal(
    streamedDsmlNormalized.toolCalls[0]?.arguments.path,
    "packages/config/src/load-config.ts",
  );

  const reasoningNormalized = normalizeOpenAIResponse({
    choices: [
      {
        finish_reason: "stop",
        message: {
          reasoning_content: "Let me analyze this carefully.",
          content: "The answer is 42.",
        },
      },
    ],
  });
  assert.equal(reasoningNormalized.reasoningContent, "Let me analyze this carefully.");
  assert.equal(reasoningNormalized.text, "The answer is 42.");

  const originalTimeoutOverride = process.env.AGENT_MODEL_TIMEOUT_MS;
  process.env.AGENT_MODEL_TIMEOUT_MS = "12345";
  assert.equal(getDefaultTimeoutMs(), 12345);
  if (originalTimeoutOverride === undefined) {
    delete process.env.AGENT_MODEL_TIMEOUT_MS;
  } else {
    process.env.AGENT_MODEL_TIMEOUT_MS = originalTimeoutOverride;
  }

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

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: [
                "<｜｜DSML｜｜tool_calls>",
                "<｜｜DSML｜｜invoke name=\"run_shell\" @=\"x\">",
                "<｜｜DSML｜｜parameter name=\"command\" string=\"true\">npm test</｜｜DSML｜｜parameter>",
                "</｜｜DSML｜｜invoke>",
                "</｜｜DSML｜｜tool_calls>",
              ].join("\n"),
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
    const response = await provider.chat({
      messages: request.messages,
      tools: [],
    });
    assert.equal(response.toolCalls.length, 0);
    assert.equal(response.finishReason, "stop");
    assert.equal(response.text, "");
  } finally {
    globalThis.fetch = originalFetch;
  }

  let capturedDeepSeekPayload: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    capturedDeepSeekPayload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "sanitized",
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const provider = new OpenAICompatibleProvider({
      name: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "test-key",
      model: "deepseek-v4-pro",
    });
    const response = await provider.chat({
      messages: [
        {
          id: "m1",
          role: "user",
          content: "分析项目",
          createdAt: new Date().toISOString(),
        },
        {
          id: "m2",
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
          toolCalls: [
            {
              id: "call_1",
              name: "list_dir",
              arguments: { path: "." },
            },
          ],
        },
        {
          id: "m3",
          role: "tool",
          content: "files",
          createdAt: new Date().toISOString(),
          toolCallId: "call_1",
          name: "list_dir",
        },
        {
          id: "m4",
          role: "tool",
          content: "orphan",
          createdAt: new Date().toISOString(),
          toolCallId: "call_stale",
          name: "read_file",
        },
      ],
    });
    assert.equal(response.text, "sanitized");

    const payloadMessages = (capturedDeepSeekPayload?.messages ?? []) as Array<Record<string, unknown>>;
    const toolMessages = payloadMessages.filter((message) => message.role === "tool");
    assert.equal(toolMessages.length, 1);
    assert.equal(toolMessages[0]?.tool_call_id, "call_1");
    assert.equal("name" in toolMessages[0], false);
    assert.deepEqual(capturedDeepSeekPayload?.thinking, { type: "enabled" });
    assert.equal(provider.getCapabilities().reasoning, true);
    assert.equal(provider.getCapabilities().streaming, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  let capturedOrphanedRoundPayload: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    capturedOrphanedRoundPayload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "orphan-round-sanitized",
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const provider = new OpenAICompatibleProvider({
      name: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "test-key",
      model: "deepseek-v4-pro",
    });
    await provider.chat({
      messages: [
        {
          id: "m1",
          role: "user",
          content: "继续",
          createdAt: new Date().toISOString(),
        },
        {
          id: "m2",
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
          toolCalls: [
            {
              id: "call_orphan",
              name: "read_file",
              arguments: { path: "README.md" },
            },
          ],
        },
        {
          id: "m3",
          role: "user",
          content: "再看一下",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const payloadMessages = (capturedOrphanedRoundPayload?.messages ?? []) as Array<Record<string, unknown>>;
    assert.equal(
      payloadMessages.some(
        (message) =>
          message.role === "assistant" &&
          Array.isArray(message.tool_calls) &&
          message.tool_calls.length > 0,
      ),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts < 3) {
      return new Response("temporarily overloaded", {
        status: 429,
        headers: {
          "Content-Type": "text/plain",
          "retry-after-ms": "1",
        },
      });
    }

    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "retried successfully",
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const provider = new OpenAICompatibleProvider({
      name: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "test-key",
      model: "deepseek-v4-pro",
    });
    const response = await provider.chat(request);
    assert.equal(response.text, "retried successfully");
    assert.equal(attempts, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }

  let nonRetryAttempts = 0;
  globalThis.fetch = async () => {
    nonRetryAttempts += 1;
    return new Response("bad request", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  };

  try {
    const provider = new OpenAICompatibleProvider({
      name: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "test-key",
      model: "deepseek-v4-pro",
    });
    await assert.rejects(() => provider.chat(request), /400/);
    assert.equal(nonRetryAttempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }

  let capturedReasoningPayload: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    capturedReasoningPayload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              reasoning_content: "internal chain",
              content: "visible answer",
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const provider = new OpenAICompatibleProvider({
      name: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "test-key",
      model: "deepseek-v4-pro",
    });
    const response = await provider.chat({
      messages: [
        {
          id: "m1",
          role: "user",
          content: "hello",
          createdAt: new Date().toISOString(),
        },
        {
          id: "m2",
          role: "assistant",
          content: "done",
          createdAt: new Date().toISOString(),
          reasoningContent: "prior reasoning",
          toolCalls: [
            {
              id: "call_1",
              name: "read_file",
              arguments: { path: "README.md" },
            },
          ],
        },
        {
          id: "m3",
          role: "tool",
          content: "file contents",
          createdAt: new Date().toISOString(),
          toolCallId: "call_1",
        },
      ],
    });
    assert.equal(response.reasoningContent, "internal chain");
    assert.equal(response.text, "visible answer");
    const payloadMessages = (capturedReasoningPayload?.messages ?? []) as Array<
      Record<string, unknown>
    >;
    const assistantWithReasoning = payloadMessages.find(
      (message) => message.role === "assistant" && message.reasoning_content !== undefined,
    );
    assert.equal(assistantWithReasoning?.reasoning_content, "prior reasoning");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const streamChunks = [
    'data: {"choices":[{"delta":{"reasoning_content":"Think "},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{"reasoning_content":"hard."},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{"content":"Answer"},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{"content":"!"},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n',
    "data: [DONE]\n\n",
  ];
  let streamBodyIndex = 0;
  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    assert.equal(payload.stream, true);
    assert.deepEqual(payload.thinking, { type: "enabled" });
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        pull(controller) {
          if (streamBodyIndex >= streamChunks.length) {
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(streamChunks[streamBodyIndex]));
          streamBodyIndex += 1;
        },
      }),
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    );
  };

  try {
    const provider = new OpenAICompatibleProvider({
      name: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "test-key",
      model: "deepseek-v4-pro",
    });
    const reasoningParts: string[] = [];
    const contentParts: string[] = [];
    let finalResponse: Awaited<ReturnType<typeof provider.chat>> | undefined;

    for await (const event of provider.stream({
      messages: request.messages,
      tools: [],
    })) {
      if (event.type === "reasoning_delta") {
        reasoningParts.push(event.delta);
      }
      if (event.type === "content_delta") {
        contentParts.push(event.delta);
      }
      if (event.type === "done") {
        finalResponse = event.response;
      }
    }

    assert.equal(reasoningParts.join(""), "Think hard.");
    assert.equal(contentParts.join(""), "Answer!");
    assert.equal(finalResponse?.reasoningContent, "Think hard.");
    assert.equal(finalResponse?.text, "Answer!");
    assert.equal(finalResponse?.finishReason, "stop");
    assert.equal(finalResponse?.usage?.totalTokens, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const previousQwenApiKey = process.env.QWEN_API_KEY;
  const previousLocalModel = process.env.LOCAL_MODEL_NAME;
  try {
    process.env.QWEN_API_KEY = "qwen-key";
    process.env.LOCAL_MODEL_NAME = "qwen2.5-coder";

    const qwenBySelector = createModelProvider(
      { defaultModel: "unused", models: {}, logging: { level: "info" } },
      "qwen:qwen3-coder-plus",
    );
    assert.equal(qwenBySelector.name, "qwen");

    const localBySelector = createModelProvider(
      { defaultModel: "unused", models: {}, logging: { level: "info" } },
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
        logging: { level: "info" },
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
