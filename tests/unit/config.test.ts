import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "@code-mind/config";
import {
  DEFAULT_LOCAL_BASE_URL,
  DEFAULT_QWEN_BASE_URL,
} from "@code-mind/config";

export function runConfigTests(): void {
  const dir = mkdtempSync(join(tmpdir(), "code-mind-config-"));
  const configPath = join(dir, "config.yaml");

  writeFileSync(
    configPath,
    [
      "default_model: local",
      "models:",
      "  local:",
      "    provider: openai-compatible",
      "    base_url: https://api.deepseek.com",
      "    api_key: test-key",
      "    model: deepseek-v4-pro",
      "logging:",
      "  level: debug",
    ].join("\n"),
    "utf8",
  );

  const config = loadConfig(configPath);
  assert.equal(config.defaultModel, "local");
  assert.equal(config.models.local?.baseUrl, "https://api.deepseek.com");
  assert.equal(config.logging.level, "debug");
  assert.equal(process.env.AGENT_LOG_LEVEL, "debug");

  const previousQwenApiKey = process.env.QWEN_API_KEY;
  const previousQwenModel = process.env.QWEN_MODEL;
  const previousLocalModel = process.env.LOCAL_MODEL_NAME;
  const previousLocalBaseUrl = process.env.LOCAL_MODEL_BASE_URL;
  const previousLogLevel = process.env.AGENT_LOG_LEVEL;

  process.env.QWEN_API_KEY = "qwen-key";
  process.env.QWEN_MODEL = "qwen3-coder-plus";
  process.env.LOCAL_MODEL_NAME = "qwen2.5-coder";
  process.env.AGENT_LOG_LEVEL = "warn";
  delete process.env.LOCAL_MODEL_BASE_URL;

  try {
    const envConfig = loadConfig(join(dir, "missing.yaml"));
    assert.equal(envConfig.models.qwen?.provider, "qwen");
    assert.equal(envConfig.models.qwen?.baseUrl, DEFAULT_QWEN_BASE_URL);
    assert.equal(envConfig.models.local?.provider, "local");
    assert.equal(envConfig.models.local?.baseUrl, DEFAULT_LOCAL_BASE_URL);
    assert.equal(envConfig.logging.level, "warn");
    assert.equal(process.env.AGENT_LOG_LEVEL, "warn");
  } finally {
    if (previousQwenApiKey === undefined) {
      delete process.env.QWEN_API_KEY;
    } else {
      process.env.QWEN_API_KEY = previousQwenApiKey;
    }
    if (previousQwenModel === undefined) {
      delete process.env.QWEN_MODEL;
    } else {
      process.env.QWEN_MODEL = previousQwenModel;
    }
    if (previousLocalModel === undefined) {
      delete process.env.LOCAL_MODEL_NAME;
    } else {
      process.env.LOCAL_MODEL_NAME = previousLocalModel;
    }
    if (previousLocalBaseUrl === undefined) {
      delete process.env.LOCAL_MODEL_BASE_URL;
    } else {
      process.env.LOCAL_MODEL_BASE_URL = previousLocalBaseUrl;
    }
    if (previousLogLevel === undefined) {
      delete process.env.AGENT_LOG_LEVEL;
    } else {
      process.env.AGENT_LOG_LEVEL = previousLogLevel;
    }
  }
}
