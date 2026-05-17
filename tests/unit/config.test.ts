import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config/load-config.js";

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
    ].join("\n"),
    "utf8",
  );

  const config = loadConfig(configPath);
  assert.equal(config.defaultModel, "local");
  assert.equal(config.models.local?.baseUrl, "https://api.deepseek.com");
}
