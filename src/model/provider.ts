import type { AgentConfig } from "../config/schema.js";
import type { ModelProvider } from "../shared/types.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import { ValidationError } from "../shared/errors.js";
import { LocalModelProvider, DEFAULT_LOCAL_API_KEY, DEFAULT_LOCAL_BASE_URL } from "./local.js";
import { QwenProvider, DEFAULT_QWEN_BASE_URL } from "./qwen.js";

interface ParsedModelSelector {
  provider: string;
  model: string;
}

function requireValue(value: string | undefined, message: string): string {
  if (!value) {
    throw new ValidationError(message);
  }

  return value;
}

function parseModelSelector(modelName?: string): ParsedModelSelector | null {
  if (!modelName || !modelName.includes(":")) {
    return null;
  }

  const [provider, model] = modelName.split(":", 2);
  if (!provider || !model) {
    throw new ValidationError(`Invalid model selector: ${modelName}`);
  }

  return { provider, model };
}

export function createModelProvider(
  config: AgentConfig,
  modelName?: string,
): ModelProvider {
  const selector = parseModelSelector(modelName);
  if (selector) {
    switch (selector.provider) {
      case "qwen":
        return new QwenProvider({
          name: "qwen",
          baseUrl: process.env.QWEN_BASE_URL ?? DEFAULT_QWEN_BASE_URL,
          apiKey: requireValue(
            process.env.QWEN_API_KEY ?? process.env.DASHSCOPE_API_KEY,
            "Qwen model selector requires QWEN_API_KEY or DASHSCOPE_API_KEY.",
          ),
          model: selector.model,
        });
      case "local":
        return new LocalModelProvider({
          name: "local",
          baseUrl: process.env.LOCAL_MODEL_BASE_URL ?? DEFAULT_LOCAL_BASE_URL,
          apiKey: process.env.LOCAL_MODEL_API_KEY ?? DEFAULT_LOCAL_API_KEY,
          model: selector.model,
        });
      default:
        throw new ValidationError(`Unsupported model selector provider: ${selector.provider}`);
    }
  }

  const resolvedName = modelName ?? config.defaultModel;
  const model = config.models[resolvedName];

  if (!model) {
    throw new ValidationError(`Unknown model configuration: ${resolvedName}`);
  }

  switch (model.provider) {
    case "openai-compatible":
    case "deepseek":
      return new OpenAICompatibleProvider({
        name: resolvedName,
        baseUrl: model.baseUrl,
        apiKey: model.apiKey,
        model: model.model,
      });
    case "qwen":
      return new QwenProvider({
        name: resolvedName,
        baseUrl: model.baseUrl,
        apiKey: model.apiKey,
        model: model.model,
      });
    case "local":
      return new LocalModelProvider({
        name: resolvedName,
        baseUrl: model.baseUrl,
        apiKey: model.apiKey,
        model: model.model,
      });
    default:
      throw new ValidationError(`Unsupported provider: ${model.provider}`);
  }
}
