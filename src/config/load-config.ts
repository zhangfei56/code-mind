import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import type { AgentConfig, ModelConfig } from "./schema.js";
import { configSchema } from "./schema.js";
import { ValidationError } from "../shared/errors.js";
import {
  DEFAULT_LOCAL_API_KEY,
  DEFAULT_LOCAL_BASE_URL,
} from "../model/local.js";
import {
  DEFAULT_QWEN_BASE_URL,
  DEFAULT_QWEN_MODEL,
} from "../model/qwen.js";

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro";

function loadConfigFile(configPath: string): AgentConfig | null {
  if (!existsSync(configPath)) {
    return null;
  }

  const raw = readFileSync(configPath, "utf8");
  const parsed = YAML.parse(raw);
  const normalized = parsed as Record<string, unknown>;

  const candidate = {
    defaultModel: normalized.default_model,
    models: Object.fromEntries(
      Object.entries((normalized.models ?? {}) as Record<string, Record<string, unknown>>).map(
        ([key, value]) => [
          key,
          {
            provider: value.provider,
            baseUrl: value.base_url,
            apiKey: value.api_key,
            model: value.model,
          },
        ],
      ),
    ),
  };

  return configSchema.parse(candidate);
}

function loadDeepSeekEnvModel(): ModelConfig | null {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return null;
  }

  return {
    provider: "openai-compatible",
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL,
    apiKey,
    model: process.env.DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL,
  };
}

function loadGenericEnvModel(): ModelConfig | null {
  const baseUrl = process.env.AGENT_MODEL_BASE_URL;
  const apiKey = process.env.AGENT_MODEL_API_KEY;
  const model = process.env.AGENT_MODEL_NAME;

  if (!baseUrl || !apiKey || !model) {
    return null;
  }

  return {
    provider: "openai-compatible",
    baseUrl,
    apiKey,
    model,
  };
}

function loadQwenEnvModel(): ModelConfig | null {
  const apiKey = process.env.QWEN_API_KEY ?? process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    return null;
  }

  return {
    provider: "qwen",
    baseUrl: process.env.QWEN_BASE_URL ?? DEFAULT_QWEN_BASE_URL,
    apiKey,
    model: process.env.QWEN_MODEL ?? DEFAULT_QWEN_MODEL,
  };
}

function loadLocalEnvModel(): ModelConfig | null {
  const model = process.env.LOCAL_MODEL_NAME;
  if (!model) {
    return null;
  }

  return {
    provider: "local",
    baseUrl: process.env.LOCAL_MODEL_BASE_URL ?? DEFAULT_LOCAL_BASE_URL,
    apiKey: process.env.LOCAL_MODEL_API_KEY ?? DEFAULT_LOCAL_API_KEY,
    model,
  };
}

export function loadConfig(configPath?: string): AgentConfig {
  const explicitPath = configPath ?? join(homedir(), ".agent", "config.yaml");
  const fileConfig = loadConfigFile(explicitPath);
  const envDeepSeek = loadDeepSeekEnvModel();
  const envGeneric = loadGenericEnvModel();
  const envQwen = loadQwenEnvModel();
  const envLocal = loadLocalEnvModel();
  const envModels = {
    ...(envQwen ? { qwen: envQwen } : {}),
    ...(envLocal ? { local: envLocal } : {}),
    ...(envGeneric ? { env: envGeneric } : {}),
    ...(envDeepSeek ? { deepseek: envDeepSeek } : {}),
  };
  const envDefaultModel =
    Object.keys(envModels)[0] ?? null;

  if (fileConfig && envDefaultModel) {
    return {
      defaultModel: fileConfig.defaultModel,
      models: {
        ...fileConfig.models,
        ...envModels,
      },
    };
  }

  if (fileConfig) {
    return fileConfig;
  }

  if (envDefaultModel) {
    return {
      defaultModel: envDefaultModel,
      models: envModels,
    };
  }

  throw new ValidationError(
    "No model configuration found. Set ~/.agent/config.yaml, AGENT_MODEL_* env vars, DEEPSEEK_API_KEY, QWEN_API_KEY, or LOCAL_MODEL_NAME.",
  );
}
