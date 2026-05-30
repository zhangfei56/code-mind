import type { ModelResponse, ToolCall, TokenUsage } from "@code-mind/shared";
import { normalizeOpenAIResponse, stripDsmlToolCallMarkup } from "./normalizer.js";

interface StreamChoiceDelta {
  reasoning_content?: string | null;
  content?: string | null;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

interface StreamChunk {
  choices?: Array<{
    delta?: StreamChoiceDelta;
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface PendingToolCall {
  id?: string;
  name?: string;
  arguments: string;
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

function normalizeUsage(usage: StreamChunk["usage"]): TokenUsage | undefined {
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  };
}

export interface StreamChunkDeltas {
  reasoningDelta?: string;
  contentDelta?: string;
}

export class OpenAIStreamAccumulator {
  reasoningContent = "";
  content = "";
  private readonly pendingToolCalls = new Map<number, PendingToolCall>();
  finishReason: ModelResponse["finishReason"] = "stop";
  usage: TokenUsage | undefined;
  private readonly rawChunks: unknown[] = [];

  applyChunk(raw: unknown): StreamChunkDeltas {
    this.rawChunks.push(raw);
    const chunk = raw as StreamChunk;
    const choice = chunk.choices?.[0];
    const delta = choice?.delta;
    const deltas: StreamChunkDeltas = {};

    if (delta?.reasoning_content) {
      this.reasoningContent += delta.reasoning_content;
      deltas.reasoningDelta = delta.reasoning_content;
    }

    if (delta?.content) {
      this.content += delta.content;
      deltas.contentDelta = delta.content;
    }

    for (const toolCallDelta of delta?.tool_calls ?? []) {
      const index = toolCallDelta.index ?? 0;
      const pending = this.pendingToolCalls.get(index) ?? { arguments: "" };
      if (toolCallDelta.id) {
        pending.id = toolCallDelta.id;
      }
      if (toolCallDelta.function?.name) {
        pending.name = toolCallDelta.function.name;
      }
      if (toolCallDelta.function?.arguments) {
        pending.arguments += toolCallDelta.function.arguments;
      }
      this.pendingToolCalls.set(index, pending);
    }

    const finishReason = choice?.finish_reason;
    if (
      finishReason === "stop" ||
      finishReason === "tool_calls" ||
      finishReason === "length"
    ) {
      this.finishReason =
        finishReason === "tool_calls"
          ? "tool_call"
          : finishReason === "length"
            ? "length"
            : "stop";
    }

    const usage = normalizeUsage(chunk.usage);
    if (usage) {
      this.usage = usage;
    }

    return deltas;
  }

  buildToolCalls(): ToolCall[] {
    return [...this.pendingToolCalls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([index, pending]) => ({
        id: pending.id ?? `stream_tool_call_${index + 1}`,
        name: pending.name ?? "unknown_tool",
        arguments: parseToolArguments(pending.arguments),
        raw: pending,
      }));
  }

  buildResponse(hasTools: boolean): ModelResponse {
    const toolCalls = this.buildToolCalls();
    const sanitizedText = stripDsmlToolCallMarkup(this.content);
    const finishReason =
      toolCalls.length > 0
        ? "tool_call"
        : this.finishReason === "tool_call"
          ? "stop"
          : this.finishReason;

    return {
      text: sanitizedText,
      toolCalls: hasTools ? toolCalls : toolCalls.length > 0 ? [] : toolCalls,
      finishReason: hasTools
        ? finishReason
        : finishReason === "tool_call"
          ? "stop"
          : finishReason,
      ...(this.reasoningContent.length > 0
        ? { reasoningContent: this.reasoningContent }
        : {}),
      ...(this.usage === undefined ? {} : { usage: this.usage }),
      raw: this.rawChunks,
    };
  }
}

export async function* readOpenAISseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }
        const data = trimmed.slice(5).trim();
        if (data.length === 0 || data === "[DONE]") {
          if (data === "[DONE]") {
            return;
          }
          continue;
        }
        yield data;
      }
    }

    const trailing = buffer.trim();
    if (trailing.startsWith("data:")) {
      const data = trailing.slice(5).trim();
      if (data.length > 0 && data !== "[DONE]") {
        yield data;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
