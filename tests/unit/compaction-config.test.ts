import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCompactionRuntimeOverrides } from "@code-mind/agent-composition";
import { loadConfig } from "@code-mind/config";
import { resolveCompactionPolicy } from "@code-mind/shared";

export function runCompactionConfigTests(): void {
  const dir = mkdtempSync(join(tmpdir(), "code-mind-compact-config-"));
  const configPath = join(dir, "config.yaml");

  writeFileSync(
    configPath,
    [
      "default_model: deepseek",
      "models:",
      "  deepseek:",
      "    provider: openai-compatible",
      "    base_url: https://api.deepseek.com",
      "    api_key: test-key",
      "    model: deepseek-chat",
      "  compact:",
      "    provider: openai-compatible",
      "    base_url: https://api.deepseek.com",
      "    api_key: test-key",
      "    model: deepseek-chat",
      "compaction:",
      "  char_threshold: 12000",
      "  retained_messages: 6",
      "  retained_observations: 4",
      "  model: compact",
      "logging:",
      "  level: info",
    ].join("\n"),
    "utf8",
  );

  const config = loadConfig(configPath);
  assert.equal(config.compaction?.charThreshold, 12_000);
  assert.equal(config.compaction?.retainedMessages, 6);
  assert.equal(config.compaction?.retainedObservations, 4);
  assert.equal(config.compaction?.model, "compact");

  const policy = resolveCompactionPolicy({
    charThreshold: config.compaction?.charThreshold,
    retainedMessages: config.compaction?.retainedMessages,
    retainedObservations: config.compaction?.retainedObservations,
    modelName: config.compaction?.model,
  });
  assert.equal(policy.charThreshold, 12_000);
  assert.equal(policy.retainedMessages, 6);
  assert.equal(policy.modelName, "compact");

  const overrides = buildCompactionRuntimeOverrides("deepseek", config);
  assert.equal(overrides.compactionPolicy?.charThreshold, 12_000);
  assert.equal(overrides.compactionPolicy?.modelName, "compact");
  assert.ok(overrides.compactionModel);
  assert.equal(overrides.compactionModel?.name, "compact");

  const previousThreshold = process.env.CODE_MIND_COMPACTION_CHAR_THRESHOLD;
  process.env.CODE_MIND_COMPACTION_CHAR_THRESHOLD = "9000";
  try {
    const envWins = resolveCompactionPolicy({
      charThreshold: config.compaction?.charThreshold,
    });
    assert.equal(envWins.charThreshold, 9000);
  } finally {
    if (previousThreshold === undefined) {
      delete process.env.CODE_MIND_COMPACTION_CHAR_THRESHOLD;
    } else {
      process.env.CODE_MIND_COMPACTION_CHAR_THRESHOLD = previousThreshold;
    }
  }
}
