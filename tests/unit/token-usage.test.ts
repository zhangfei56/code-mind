import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addTokenUsage,
  mergeSessionUsageSummary,
  normalizeProviderUsage,
} from "@code-mind/shared";
import { FileSessionStore } from "@code-mind/session";

export async function runTokenUsageTests(): Promise<void> {
  const openAiUsage = normalizeProviderUsage({
    prompt_tokens: 2000,
    completion_tokens: 100,
    total_tokens: 2100,
    prompt_tokens_details: { cached_tokens: 1500 },
  });
  assert.ok(openAiUsage);
  assert.equal(openAiUsage.inputTokens, 2000);
  assert.equal(openAiUsage.cachedInputTokens, 1500);
  assert.equal(openAiUsage.uncachedInputTokens, 500);

  const anthropicUsage = normalizeProviderUsage({
    input_tokens: 1000,
    output_tokens: 50,
    cache_read_input_tokens: 800,
    cache_creation_input_tokens: 120,
  });
  assert.ok(anthropicUsage);
  assert.equal(anthropicUsage.cachedInputTokens, 800);
  assert.equal(anthropicUsage.cacheWriteInputTokens, 120);
  assert.equal(anthropicUsage.uncachedInputTokens, 200);

  const deepseekUsage = normalizeProviderUsage({
    prompt_tokens: 5000,
    completion_tokens: 120,
    total_tokens: 5120,
    prompt_cache_hit_tokens: 4200,
    prompt_cache_miss_tokens: 800,
  });
  assert.ok(deepseekUsage);
  assert.equal(deepseekUsage.inputTokens, 5000);
  assert.equal(deepseekUsage.cachedInputTokens, 4200);
  assert.equal(deepseekUsage.uncachedInputTokens, 800);

  const merged = mergeSessionUsageSummary(
    {
      modelCalls: 2,
      inputTokens: 100,
      outputTokens: 10,
      totalTokens: 110,
      lastUpdatedAt: "2026-01-01T00:00:00.000Z",
    },
    { inputTokens: 50, outputTokens: 5, totalTokens: 55, cachedInputTokens: 40 },
    { modelCalls: 1, updatedAt: "2026-01-02T00:00:00.000Z" },
  );
  assert.equal(merged.modelCalls, 3);
  assert.equal(merged.inputTokens, 150);
  assert.equal(merged.cachedInputTokens, 40);

  const target = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  addTokenUsage(target, { inputTokens: 10, outputTokens: 2, totalTokens: 12, cachedInputTokens: 6 });
  addTokenUsage(target, { inputTokens: 5, outputTokens: 1, totalTokens: 6, cachedInputTokens: 3 });
  assert.equal(target.cachedInputTokens, 9);

  const workspace = mkdtempSync(join(tmpdir(), "code-mind-usage-"));
  const store = new FileSessionStore(workspace);
  const session = await store.create(
    {
      id: "task_usage",
      text: "usage test",
      cwd: workspace,
      mode: "ask",
      maxSteps: 3,
    },
    { id: "profile", name: "test", systemPrompt: "test" },
  );

  await store.recordModelUsage(session.id, {
    ts: "2026-05-31T00:00:00.000Z",
    runId: "run_1",
    step: 1,
    model: "deepseek",
    finishReason: "stop",
    durationMs: 1200,
    usage: {
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      cachedInputTokens: 60,
      uncachedInputTokens: 40,
    },
  });

  const ledger = await readFile(
    join(store.getSessionDir(session.id), "usage-ledger.jsonl"),
    "utf8",
  );
  assert.match(ledger, /"cachedInputTokens":60/);

  const manifest = await store.readManifest(session.id);
  assert.equal(manifest.usageSummary?.modelCalls, 1);
  assert.equal(manifest.usageSummary?.totalTokens, 120);
  assert.equal(manifest.usageSummary?.cachedInputTokens, 60);
}
