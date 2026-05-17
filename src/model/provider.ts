import type { AgentConfig } from "../config/schema.js";
import type { ModelProvider } from "../shared/types.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import { ValidationError } from "../shared/errors.js";

export function createModelProvider(
  config: AgentConfig,
  modelName?: string,
): ModelProvider {
  const resolvedName = modelName ?? config.defaultModel;
  const model = config.models[resolvedName];

  if (!model) {
    throw new ValidationError(`Unknown model configuration: ${resolvedName}`);
  }

  if (model.provider !== "openai-compatible") {
    throw new ValidationError(`Unsupported provider: ${model.provider}`);
  }

  return new OpenAICompatibleProvider({
    name: resolvedName,
    baseUrl: model.baseUrl,
    apiKey: model.apiKey,
    model: model.model,
  });
}
