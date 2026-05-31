import type { ModelResponse, ToolCall, TokenUsage } from "@code-mind/shared";
import { normalizeProviderUsage } from "@code-mind/shared";

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
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
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
  return normalizeProviderUsage(response.usage);
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
  const normalized = normalizeDsmlFormatting(text);
  if (
    !normalized.includes("<｜｜DSML｜｜tool_calls>") &&
    !containsDsmlMarkup(normalized)
  ) {
    return [];
  }

  return parseDsmlToolCalls(normalized).map((toolCall, index) => ({
    id: `dsml_tool_call_${index + 1}`,
    name: toolCall.name,
    arguments: toolCall.arguments,
    raw: toolCall,
  }));
}

/** Whether text contains DeepSeek DSML markup (including streamed line breaks). */
export function containsDsmlMarkup(text: string): boolean {
  return /<\s*(?:｜\s*){2}\s*DSML\b/i.test(text) || /<｜｜DSML/i.test(text);
}

/** Collapse whitespace/newlines inside streamed DSML markup tokens. */
export function normalizeDsmlFormatting(text: string): string {
  let out = text;
  out = out.replace(/<\s*(?=(?:｜\s*){2}\s*DSML\b)/gi, "<");
  out = out.replace(/<\/\s*(?=(?:｜\s*){2}\s*DSML\b)/gi, "</");
  out = out.replace(/(?:｜\s*){2}\s*DSML\s*(?:｜\s*){2}/gi, "｜｜DSML｜｜");
  out = out.replace(/\btool\s+_?\s*calls\b/gi, "tool_calls");
  out = out.replace(/\binv\s*oke\b/gi, "invoke");
  out = out.replace(/\bpar\s*ameter\b/gi, "parameter");
  const collapseDsmlTagInner = (inner: string): string => {
    const normalized = inner
      .replace(/(?:｜\s*){2}\s*DSML\s*(?:｜\s*){2}/gi, "｜｜DSML｜｜")
      .replace(/\btool\s+_?\s*calls\b/gi, "tool_calls")
      .replace(/\binv\s*oke\b/gi, "invoke")
      .replace(/\bpar\s*ameter\b/gi, "parameter");
    // Preserve attribute spacing (`invoke name="read"`) while still joining
    // streamed token fragments (`tool` + `_c` + `alls` → `tool_calls`).
    if (/=\s*["']/.test(normalized)) {
      return normalized.replace(/\s+/g, " ").trim();
    }
    return normalized.replace(/\s+/g, "");
  };
  out = out.replace(/<\s*\/\s*([\s\S]*?)\s*>/g, (_match, inner: string) => {
    if (!/DSML|｜｜|tool_calls|invoke|parameter/i.test(inner)) {
      return `</${inner}>`;
    }
    return `</${collapseDsmlTagInner(inner)}>`;
  });
  out = out.replace(/<\s*(?!\/)([\s\S]*?)\s*>/g, (_match, inner: string) => {
    if (!/DSML|｜｜|tool_calls|invoke|parameter/i.test(inner)) {
      return `<${inner}>`;
    }
    return `<${collapseDsmlTagInner(inner)}>`;
  });
  return out;
}

function stripTrailingDsmlBlock(text: string): string {
  const openMatch = text.match(/<\s*(?:｜\s*){2}\s*DSML/i);
  if (openMatch?.index === undefined) {
    return text;
  }
  return text.slice(0, openMatch.index).trimEnd();
}

export function stripDsmlToolCallMarkup(text: string): string {
  const normalized = normalizeDsmlFormatting(text);
  let result = normalized
    .replace(/<｜｜DSML｜｜tool_calls>[\s\S]*?<\/｜｜DSML｜｜tool_calls>/gi, "")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  if (containsDsmlMarkup(result)) {
    result = stripTrailingDsmlBlock(result);
  }
  return result;
}

export function normalizeOpenAIResponse(raw: unknown): ModelResponse {
  const response = raw as OpenAIChatResponse;
  const firstChoice = response.choices?.[0];
  const message = firstChoice?.message;
  const finishReason = firstChoice?.finish_reason ?? "error";
  const usage = normalizeUsage(response);
  const rawText = message?.content ?? "";
  const reasoningContent =
    typeof message?.reasoning_content === "string" && message.reasoning_content.length > 0
      ? message.reasoning_content
      : undefined;
  const toolCalls = normalizeToolCalls(message);
  const fallbackToolCalls =
    toolCalls.length === 0
      ? [
          ...normalizeJsonActionText(rawText),
          ...normalizeDsmlText(rawText),
        ]
      : [];
  const text = containsDsmlMarkup(rawText) ? stripDsmlToolCallMarkup(rawText) : rawText;

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
