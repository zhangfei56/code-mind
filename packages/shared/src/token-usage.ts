import type { SessionUsageSummary, TokenUsage } from "./types.js";

/** One model API call entry in sessions/<id>/usage-ledger.jsonl. */
export type { ModelUsageRecord, SessionUsageSummary } from "./types.js";

export function createEmptyTokenUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

export function addTokenUsage(target: TokenUsage, delta: TokenUsage): void {
  target.inputTokens += delta.inputTokens;
  target.outputTokens += delta.outputTokens;
  target.totalTokens += delta.totalTokens;
  if (delta.cachedInputTokens !== undefined) {
    target.cachedInputTokens = (target.cachedInputTokens ?? 0) + delta.cachedInputTokens;
  }
  if (delta.cacheWriteInputTokens !== undefined) {
    target.cacheWriteInputTokens =
      (target.cacheWriteInputTokens ?? 0) + delta.cacheWriteInputTokens;
  }
  if (delta.uncachedInputTokens !== undefined) {
    target.uncachedInputTokens = (target.uncachedInputTokens ?? 0) + delta.uncachedInputTokens;
  }
}

/** Normalize provider usage objects (OpenAI-compatible, Anthropic-style, DeepSeek KV cache). */
export function normalizeProviderUsage(raw: unknown): TokenUsage | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const usage = raw as Record<string, unknown>;

  if (
    typeof usage.inputTokens === "number" &&
    typeof usage.outputTokens === "number"
  ) {
    return {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens:
        typeof usage.totalTokens === "number"
          ? usage.totalTokens
          : usage.inputTokens + usage.outputTokens,
      ...(typeof usage.cachedInputTokens === "number"
        ? { cachedInputTokens: usage.cachedInputTokens }
        : {}),
      ...(typeof usage.cacheWriteInputTokens === "number"
        ? { cacheWriteInputTokens: usage.cacheWriteInputTokens }
        : {}),
      ...(typeof usage.uncachedInputTokens === "number"
        ? { uncachedInputTokens: usage.uncachedInputTokens }
        : {}),
    };
  }

  if (typeof usage.input_tokens === "number") {
    const inputTokens = usage.input_tokens;
    const outputTokens =
      typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
    const cachedInputTokens =
      typeof usage.cache_read_input_tokens === "number"
        ? usage.cache_read_input_tokens
        : undefined;
    const cacheWriteInputTokens =
      typeof usage.cache_creation_input_tokens === "number"
        ? usage.cache_creation_input_tokens
        : undefined;
    const uncachedInputTokens =
      cachedInputTokens !== undefined
        ? Math.max(0, inputTokens - cachedInputTokens)
        : undefined;
    return {
      inputTokens,
      outputTokens,
      totalTokens:
        typeof usage.total_tokens === "number"
          ? usage.total_tokens
          : inputTokens + outputTokens,
      ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
      ...(cacheWriteInputTokens === undefined ? {} : { cacheWriteInputTokens }),
      ...(uncachedInputTokens === undefined ? {} : { uncachedInputTokens }),
    };
  }

  return normalizeOpenAiCompatibleUsage(usage);
}

function normalizeOpenAiCompatibleUsage(
  usage: Record<string, unknown>,
): TokenUsage | undefined {
  const deepseekHit =
    typeof usage.prompt_cache_hit_tokens === "number"
      ? usage.prompt_cache_hit_tokens
      : undefined;
  const deepseekMiss =
    typeof usage.prompt_cache_miss_tokens === "number"
      ? usage.prompt_cache_miss_tokens
      : undefined;
  const hasDeepseekCache = deepseekHit !== undefined || deepseekMiss !== undefined;

  const promptTokens =
    typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined;
  if (promptTokens === undefined && !hasDeepseekCache) {
    return undefined;
  }

  const outputTokens =
    typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0;
  const inputTokens =
    promptTokens ?? (deepseekHit ?? 0) + (deepseekMiss ?? 0);

  let cachedInputTokens: number | undefined;
  let uncachedInputTokens: number | undefined;

  if (hasDeepseekCache) {
    cachedInputTokens = deepseekHit;
    uncachedInputTokens = deepseekMiss;
  } else {
    const details =
      usage.prompt_tokens_details && typeof usage.prompt_tokens_details === "object"
        ? (usage.prompt_tokens_details as Record<string, unknown>)
        : undefined;
    cachedInputTokens =
      details && typeof details.cached_tokens === "number"
        ? details.cached_tokens
        : undefined;
    uncachedInputTokens =
      cachedInputTokens !== undefined
        ? Math.max(0, inputTokens - cachedInputTokens)
        : undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens:
      typeof usage.total_tokens === "number"
        ? usage.total_tokens
        : inputTokens + outputTokens,
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    ...(uncachedInputTokens === undefined ? {} : { uncachedInputTokens }),
  };
}

export function mergeSessionUsageSummary(
  current: SessionUsageSummary | undefined,
  delta: TokenUsage,
  options: { modelCalls?: number; updatedAt: string },
): SessionUsageSummary {
  const merged = createEmptyTokenUsage();
  if (current) {
    addTokenUsage(merged, {
      inputTokens: current.inputTokens,
      outputTokens: current.outputTokens,
      totalTokens: current.totalTokens,
      ...(current.cachedInputTokens === undefined
        ? {}
        : { cachedInputTokens: current.cachedInputTokens }),
      ...(current.cacheWriteInputTokens === undefined
        ? {}
        : { cacheWriteInputTokens: current.cacheWriteInputTokens }),
      ...(current.uncachedInputTokens === undefined
        ? {}
        : { uncachedInputTokens: current.uncachedInputTokens }),
    });
  }
  addTokenUsage(merged, delta);

  return {
    modelCalls: (current?.modelCalls ?? 0) + (options.modelCalls ?? 1),
    inputTokens: merged.inputTokens,
    outputTokens: merged.outputTokens,
    totalTokens: merged.totalTokens,
    ...(merged.cachedInputTokens === undefined
      ? {}
      : { cachedInputTokens: merged.cachedInputTokens }),
    ...(merged.cacheWriteInputTokens === undefined
      ? {}
      : { cacheWriteInputTokens: merged.cacheWriteInputTokens }),
    ...(merged.uncachedInputTokens === undefined
      ? {}
      : { uncachedInputTokens: merged.uncachedInputTokens }),
    lastUpdatedAt: options.updatedAt,
  };
}

export function sessionUsageSummaryFromRunUsage(
  usage: TokenUsage,
  modelCalls: number,
  updatedAt: string,
): SessionUsageSummary {
  return mergeSessionUsageSummary(undefined, usage, { modelCalls, updatedAt });
}
