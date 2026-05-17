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

interface JsonActionToolCall {
  name?: string;
  arguments?: Record<string, unknown>;
}

interface JsonActionResponse {
  tool_calls?: JsonActionToolCall[];
  toolCall?: JsonActionToolCall;
  action?: JsonActionToolCall;
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

function normalizeJsonActionText(text: string): ToolCall[] {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as JsonActionResponse;
    const rawToolCalls = parsed.tool_calls ?? [];
    const single = parsed.toolCall ?? parsed.action;
    const toolCalls = single ? [...rawToolCalls, single] : rawToolCalls;

    return toolCalls
      .filter((toolCall) => typeof toolCall.name === "string")
      .map((toolCall, index) => ({
        id: `json_action_${index + 1}`,
        name: toolCall.name as string,
        arguments:
          toolCall.arguments && typeof toolCall.arguments === "object"
            ? toolCall.arguments
            : {},
        raw: toolCall,
      }));
  } catch {
    return [];
  }
}

export function normalizeOpenAIResponse(raw: unknown): ModelResponse {
  const response = raw as OpenAIChatResponse;
  const firstChoice = response.choices?.[0];
  const message = firstChoice?.message;
  const finishReason = firstChoice?.finish_reason ?? "error";
  const usage = normalizeUsage(response);
  const text = message?.content ?? "";
  const toolCalls = normalizeToolCalls(message);
  const fallbackToolCalls = toolCalls.length === 0 ? normalizeJsonActionText(text) : [];

  return {
    text,
    toolCalls: toolCalls.length > 0 ? toolCalls : fallbackToolCalls,
    finishReason:
      finishReason === "stop" ||
      finishReason === "tool_call" ||
      finishReason === "length"
        ? finishReason
        : (message?.tool_calls?.length ?? fallbackToolCalls.length) > 0
          ? "tool_call"
          : "error",
    raw,
    ...(usage === undefined ? {} : { usage }),
  };
}
