import type { ModelResponse, ToolCall, TokenUsage } from "@code-mind/shared";

interface OpenAIChoiceMessage {
  content?: string | null;
  reasoning_content?: string | null;
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

interface DsmlToolCall {
  name: string;
  arguments: Record<string, unknown>;
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

function normalizeDsmlToolName(name: string): string {
  switch (name) {
    case "read":
      return "read_file";
    default:
      return name;
  }
}

function parseDsmlToolCalls(text: string): DsmlToolCall[] {
  const calls: DsmlToolCall[] = [];
  const invokePattern =
    /<｜｜DSML｜｜invoke name="([^"]+)"[^>]*>([\s\S]*?)<\/｜｜DSML｜｜invoke>/g;

  for (const match of text.matchAll(invokePattern)) {
    const rawName = match[1]?.trim();
    const body = match[2] ?? "";
    if (!rawName) {
      continue;
    }

    const args: Record<string, unknown> = {};
    const paramPattern =
      /<｜｜DSML｜｜parameter name="([^"]+)"(?: string="(true|false)")?>([\s\S]*?)<\/｜｜DSML｜｜parameter>/g;
    for (const paramMatch of body.matchAll(paramPattern)) {
      const key = paramMatch[1]?.trim();
      const stringFlag = paramMatch[2];
      const rawValue = (paramMatch[3] ?? "").trim();
      if (!key) {
        continue;
      }

      if (stringFlag === "true") {
        args[key] = rawValue;
        continue;
      }

      if (stringFlag === "false") {
        try {
          args[key] = JSON.parse(rawValue);
        } catch {
          const numeric = Number(rawValue);
          args[key] = Number.isNaN(numeric) ? rawValue : numeric;
        }
        continue;
      }

      args[key] = rawValue;
    }

    calls.push({
      name: normalizeDsmlToolName(rawName),
      arguments: args,
    });
  }

  return calls;
}

function normalizeDsmlText(text: string): ToolCall[] {
  if (!text.includes("<｜｜DSML｜｜tool_calls>")) {
    return [];
  }

  return parseDsmlToolCalls(text).map((toolCall, index) => ({
    id: `dsml_tool_call_${index + 1}`,
    name: toolCall.name,
    arguments: toolCall.arguments,
    raw: toolCall,
  }));
}

export function stripDsmlToolCallMarkup(text: string): string {
  return text
    .replace(/<｜｜DSML｜｜tool_calls>[\s\S]*?<\/｜｜DSML｜｜tool_calls>/g, "")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function normalizeOpenAIResponse(raw: unknown): ModelResponse {
  const response = raw as OpenAIChatResponse;
  const firstChoice = response.choices?.[0];
  const message = firstChoice?.message;
  const finishReason = firstChoice?.finish_reason ?? "error";
  const usage = normalizeUsage(response);
  const text = message?.content ?? "";
  const reasoningContent =
    typeof message?.reasoning_content === "string" && message.reasoning_content.length > 0
      ? message.reasoning_content
      : undefined;
  const toolCalls = normalizeToolCalls(message);
  const fallbackToolCalls =
    toolCalls.length === 0
      ? [
          ...normalizeJsonActionText(text),
          ...normalizeDsmlText(text),
        ]
      : [];

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
    ...(reasoningContent === undefined ? {} : { reasoningContent }),
    ...(usage === undefined ? {} : { usage }),
  };
}
