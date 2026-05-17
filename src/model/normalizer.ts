import type { ModelResponse, ToolCall, TokenUsage } from "../shared/types.js";

interface OpenAIChoiceMessage {
  content?: string | null;
  tool_calls?: Array<{
    id?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

interface OpenAIChatResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: OpenAIChoiceMessage;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

function parseToolArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function normalizeToolCalls(message: OpenAIChoiceMessage | undefined): ToolCall[] {
  const toolCalls = message?.tool_calls ?? [];
  return toolCalls.map((call, index) => ({
    id: call.id ?? `tool_call_${index + 1}`,
    name: call.function?.name ?? "unknown_tool",
    arguments: parseToolArguments(call.function?.arguments),
    raw: call,
  }));
}

function normalizeUsage(response: OpenAIChatResponse): TokenUsage | undefined {
  if (!response.usage) {
    return undefined;
  }

  return {
    inputTokens: response.usage.prompt_tokens ?? 0,
    outputTokens: response.usage.completion_tokens ?? 0,
    totalTokens: response.usage.total_tokens ?? 0,
  };
}

export function normalizeOpenAIResponse(raw: unknown): ModelResponse {
  const response = raw as OpenAIChatResponse;
  const firstChoice = response.choices?.[0];
  const message = firstChoice?.message;
  const finishReason = firstChoice?.finish_reason ?? "error";
  const usage = normalizeUsage(response);

  return {
    text: message?.content ?? "",
    toolCalls: normalizeToolCalls(message),
    finishReason:
      finishReason === "stop" ||
      finishReason === "tool_call" ||
      finishReason === "length"
        ? finishReason
        : message?.tool_calls?.length
          ? "tool_call"
          : "error",
    raw,
    ...(usage === undefined ? {} : { usage }),
  };
}
