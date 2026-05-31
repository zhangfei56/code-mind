import type {
  InternalMessage,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelStreamEvent,
} from "@code-mind/shared";
import { logProcess } from "@code-mind/shared";
import {
  normalizeOpenAIResponse,
  stripDsmlToolCallMarkup,
} from "../normalizer.js";
import {
  OpenAIStreamAccumulator,
  readOpenAISseEvents,
} from "../stream-parser.js";
import {
  buildHttpError,
  buildNetworkError,
  combineAbortSignals,
  createAbortSignal,
  getDefaultMaxAttempts,
  getDefaultTimeoutMs,
  getRetryDelayMs,
  shouldRetry,
  sleep,
} from "../retry.js";

export interface OpenAICompatibleProviderOptions {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** DeepSeek thinking mode; defaults to enabled for DeepSeek endpoints. */
  thinking?: boolean;
}

type WireMessage = Record<string, unknown>;

function isDeepSeekEndpoint(baseUrl: string): boolean {
  return baseUrl.includes("api.deepseek.com");
}

function resolveThinkingEnabled(
  options: OpenAICompatibleProviderOptions,
  isDeepSeek: boolean,
): boolean {
  const env = process.env.DEEPSEEK_THINKING?.trim().toLowerCase();
  if (env === "true" || env === "1") {
    return true;
  }
  if (env === "false" || env === "0") {
    return false;
  }
  if (options.thinking !== undefined) {
    return options.thinking;
  }
  return isDeepSeek;
}

function isModelStreamingEnabled(): boolean {
  const env = process.env.AGENT_MODEL_STREAM?.trim().toLowerCase();
  return env !== "false" && env !== "0";
}

function buildWireMessage(message: InternalMessage): WireMessage {
  const wireMessage: WireMessage = {
    role: message.role,
    content: message.content,
  };

  if (message.role !== "tool" && message.name !== undefined) {
    wireMessage.name = message.name;
  }

  if (message.toolCallId !== undefined) {
    wireMessage.tool_call_id = message.toolCallId;
  }

  if (
    message.role === "assistant" &&
    message.reasoningContent !== undefined &&
    message.reasoningContent.length > 0
  ) {
    wireMessage.reasoning_content = message.reasoningContent;
  }

  if (message.toolCalls?.length) {
    wireMessage.tool_calls = message.toolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: "function",
      function: {
        name: toolCall.name,
        arguments: JSON.stringify(toolCall.arguments),
      },
    }));
  }

  return wireMessage;
}

function stripOrphanedDeepSeekToolRounds(messages: WireMessage[]): WireMessage[] {
  const out = [...messages];
  let index = 0;

  while (index < out.length) {
    const current = out[index];
    if (current === undefined) {
      break;
    }
    const isAssistantWithTools =
      current.role === "assistant" && Array.isArray(current.tool_calls);

    if (!isAssistantWithTools) {
      index += 1;
      continue;
    }

    const expectedIds = new Set(
      ((current.tool_calls as Array<Record<string, unknown>> | undefined) ?? [])
        .map((toolCall) => String(toolCall.id ?? ""))
        .filter((id) => id.length > 0),
    );
    const foundIds = new Set<string>();
    let toolResultEnd = index + 1;

    while (toolResultEnd < out.length) {
      const next = out[toolResultEnd];
      if (next === undefined) {
        break;
      }
      if (next.role !== "tool") {
        break;
      }
      const toolCallId =
        typeof next.tool_call_id === "string" ? next.tool_call_id : undefined;
      if (toolCallId) {
        foundIds.add(toolCallId);
      }
      toolResultEnd += 1;
    }

    let scan = toolResultEnd;
    while (scan < out.length) {
      const next = out[scan];
      if (next === undefined) {
        break;
      }
      if (next.role === "assistant") {
        break;
      }
      if (next.role === "tool" && typeof next.tool_call_id === "string") {
        foundIds.add(next.tool_call_id);
      }
      scan += 1;
    }

    const hasMissingResults = [...expectedIds].some((id) => !foundIds.has(id));
    if (!hasMissingResults) {
      index += 1;
      continue;
    }

    delete current.tool_calls;
    const assistantContent =
      typeof current.content === "string" ? current.content.trim() : "";

    for (let removeIndex = out.length - 1; removeIndex > index; removeIndex -= 1) {
      const candidate = out[removeIndex];
      if (candidate === undefined) {
        continue;
      }
      if (
        candidate.role === "tool" &&
        typeof candidate.tool_call_id === "string" &&
        expectedIds.has(candidate.tool_call_id)
      ) {
        out.splice(removeIndex, 1);
      }
    }

    if (assistantContent.length === 0) {
      out.splice(index, 1);
      continue;
    }

    index += 1;
  }

  return out;
}

function sanitizeDeepSeekMessages(messages: InternalMessage[]): WireMessage[] {
  const sanitized: WireMessage[] = [];
  let pendingToolCallIds = new Set<string>();

  for (const message of messages) {
    if (message.role === "tool") {
      if (
        typeof message.toolCallId === "string" &&
        pendingToolCallIds.has(message.toolCallId)
      ) {
        sanitized.push(buildWireMessage(message));
        pendingToolCallIds.delete(message.toolCallId);
      }
      continue;
    }

    if (message.role === "assistant" && message.toolCalls?.length) {
      sanitized.push(buildWireMessage(message));
      pendingToolCallIds = new Set(
        message.toolCalls.map((toolCall) => toolCall.id).filter((id) => id.length > 0),
      );
      continue;
    }

    pendingToolCallIds.clear();
    sanitized.push(buildWireMessage(message));
  }

  return stripOrphanedDeepSeekToolRounds(sanitized);
}

function sanitizeModelResponse(
  response: ModelResponse,
  hasTools: boolean,
): ModelResponse {
  const sanitizedText = stripDsmlToolCallMarkup(response.text);
  return hasTools
    ? { ...response, text: sanitizedText }
    : {
        ...response,
        text: sanitizedText,
        toolCalls: [],
        finishReason:
          response.finishReason === "tool_call" ? "stop" : response.finishReason,
      };
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly thinkingEnabled: boolean;
  private readonly isDeepSeek: boolean;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.name = options.name;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.isDeepSeek = isDeepSeekEndpoint(this.baseUrl);
    this.thinkingEnabled = resolveThinkingEnabled(options, this.isDeepSeek);
  }

  private buildPayload(request: ModelRequest, stream: boolean): Record<string, unknown> {
    return {
      model: this.model,
      messages: this.isDeepSeek
        ? sanitizeDeepSeekMessages(request.messages)
        : request.messages.map((message) => buildWireMessage(message)),
      ...(request.tools?.length
        ? {
            tools: request.tools.map((tool) => ({
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema,
              },
            })),
          }
        : {}),
      ...(request.temperature === undefined
        ? {}
        : { temperature: request.temperature }),
      ...(request.maxTokens === undefined
        ? {}
        : { max_tokens: request.maxTokens }),
      ...(this.isDeepSeek
        ? {
            thinking: { type: this.thinkingEnabled ? "enabled" : "disabled" },
          }
        : {}),
      ...(stream
        ? {
            stream: true,
            stream_options: { include_usage: true },
          }
        : {}),
    };
  }

  private async fetchWithRetry(
    request: ModelRequest,
    payload: Record<string, unknown>,
    options: { stream: boolean },
  ): Promise<Response> {
    const maxAttempts = getDefaultMaxAttempts();
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const timeoutMs = getDefaultTimeoutMs();
      const { signal: timeoutSignal, cleanup: cleanupTimeout } = createAbortSignal(timeoutMs);
      const { signal, cleanup: cleanupCombined } = combineAbortSignals(
        timeoutSignal,
        request.abortSignal,
      );

      try {
        logProcess("models.openai-compatible", "debug", "Sending model HTTP request.", {
          provider: this.name,
          model: this.model,
          baseUrl: this.baseUrl,
          attempt,
          stream: options.stream,
          messageCount: request.messages.length,
          toolCount: request.tools?.length ?? 0,
          thinking: this.isDeepSeek ? this.thinkingEnabled : undefined,
          payload,
        });
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
          signal,
        });

        if (!response.ok) {
          throw await buildHttpError(response);
        }

        return response;
      } catch (error) {
        const normalizedError =
          error instanceof Error && error.name === "AbortError"
            ? buildNetworkError(error)
            : error instanceof TypeError
              ? buildNetworkError(error)
              : error;

        if (!shouldRetry(normalizedError, { attempt, maxAttempts })) {
          logProcess("models.openai-compatible", "debug", "Model request failed without retry.", {
            provider: this.name,
            model: this.model,
            attempt,
            error: normalizedError,
          });
          throw normalizedError;
        }

        logProcess("models.openai-compatible", "debug", "Retrying model request.", {
          provider: this.name,
          model: this.model,
          attempt,
          maxAttempts,
          error: normalizedError,
        });

        const onRetry = request.metadata?.onRetry;
        if (typeof onRetry === "function") {
          await onRetry({
            attempt,
            delayMs: getRetryDelayMs(normalizedError, attempt),
            error: normalizedError,
          });
        }
        await sleep(getRetryDelayMs(normalizedError, attempt));
      } finally {
        cleanupCombined();
        cleanupTimeout();
      }
    }

    throw new Error("Model request failed after retries.");
  }

  async chat(request: ModelRequest): Promise<ModelResponse> {
    const payload = this.buildPayload(request, false);
    const response = await this.fetchWithRetry(request, payload, { stream: false });
    const raw = (await response.json()) as unknown;
    logProcess("models.openai-compatible", "debug", "Received model HTTP response.", {
      provider: this.name,
      model: this.model,
      status: response.status,
      response: raw,
    });
    const normalized = normalizeOpenAIResponse(raw);
    return sanitizeModelResponse(normalized, Boolean(request.tools?.length));
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    if (!isModelStreamingEnabled()) {
      const response = await this.chat(request);
      if (response.reasoningContent) {
        yield { type: "reasoning_delta", delta: response.reasoningContent };
      }
      if (response.text) {
        yield { type: "content_delta", delta: response.text };
      }
      yield { type: "done", response };
      return;
    }

    const payload = this.buildPayload(request, true);
    let response: Response;
    try {
      response = await this.fetchWithRetry(request, payload, { stream: true });
    } catch (error) {
      yield { type: "error", error };
      return;
    }

    const body = response.body;
    if (!body) {
      yield { type: "error", error: new Error("Model stream response has no body.") };
      return;
    }

    const accumulator = new OpenAIStreamAccumulator();
    const hasTools = Boolean(request.tools?.length);

    try {
      for await (const data of readOpenAISseEvents(body)) {
        if (request.abortSignal?.aborted) {
          throw buildNetworkError(new DOMException("Aborted", "AbortError"));
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(data) as unknown;
        } catch (error) {
          yield { type: "error", error };
          return;
        }

        const deltas = accumulator.applyChunk(parsed);
        if (deltas.reasoningDelta) {
          yield { type: "reasoning_delta", delta: deltas.reasoningDelta };
        }
        if (deltas.contentDelta) {
          yield { type: "content_delta", delta: deltas.contentDelta };
        }
      }

      const modelResponse = accumulator.buildResponse(hasTools);
      logProcess("models.openai-compatible", "debug", "Completed model stream.", {
        provider: this.name,
        model: this.model,
        finishReason: modelResponse.finishReason,
        toolCallCount: modelResponse.toolCalls.length,
        textLength: modelResponse.text.length,
        reasoningLength: modelResponse.reasoningContent?.length ?? 0,
      });
      yield { type: "done", response: modelResponse };
    } catch (error) {
      yield { type: "error", error };
    }
  }

  getCapabilities(): ModelCapabilities {
    return {
      toolCall: true,
      parallelToolCall: false,
      jsonSchema: true,
      vision: false,
      reasoning: this.thinkingEnabled,
      streaming: isModelStreamingEnabled(),
      maxContextTokens: 1_000_000,
      maxOutputTokens: 384_000,
      supportsPromptCache: this.isDeepSeek,
      supportsComputerUse: false,
    };
  }
}
