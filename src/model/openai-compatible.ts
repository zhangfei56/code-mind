import type {
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "../shared/types.js";
import { normalizeOpenAIResponse } from "./normalizer.js";

export interface OpenAICompatibleProviderOptions {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.name = options.name;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.model = options.model;
  }

  async chat(request: ModelRequest): Promise<ModelResponse> {
    const isDeepSeek = this.baseUrl.includes("api.deepseek.com");
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: request.messages.map((message) => ({
          role: message.role,
          content: message.content,
          ...(message.name === undefined ? {} : { name: message.name }),
          ...(message.toolCallId === undefined
            ? {}
            : { tool_call_id: message.toolCallId }),
          ...(message.toolCalls?.length
            ? {
                tool_calls: message.toolCalls.map((toolCall) => ({
                  id: toolCall.id,
                  type: "function",
                  function: {
                    name: toolCall.name,
                    arguments: JSON.stringify(toolCall.arguments),
                  },
                })),
              }
            : {}),
        })),
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
        ...(isDeepSeek ? { thinking: { type: "disabled" } } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Model request failed: ${response.status} ${errorText}`);
    }

    const raw = (await response.json()) as unknown;
    return normalizeOpenAIResponse(raw);
  }

  getCapabilities(): ModelCapabilities {
    return {
      toolCall: true,
      parallelToolCall: false,
      jsonSchema: true,
      vision: false,
      reasoning: true,
      maxContextTokens: 1_000_000,
      maxOutputTokens: 384_000,
      supportsPromptCache: false,
      supportsComputerUse: false,
    };
  }
}
