import type { InternalMessage, Observation, TokenUsage } from "./types.js";

export interface CompactionPolicy {
  charThreshold: number;
  retainedMessages: number;
  retainedObservations: number;
  /** Optional dedicated model name; runtime may resolve via ModelProvider.name. */
  modelName?: string;
}

export const DEFAULT_COMPACTION_POLICY: CompactionPolicy = {
  charThreshold: 18_000,
  retainedMessages: 8,
  retainedObservations: 8,
};

export interface CompactionSummarizeInput {
  taskText: string;
  previousSummary: string | undefined;
  evictedMessages: InternalMessage[];
  evictedObservations: Observation[];
  compactionIndex: number;
  locale?: "zh" | "en";
}

export interface CompactionSummarizeResult {
  summaryMarkdown: string;
  strategy: "llm";
  modelName: string;
  usage?: TokenUsage;
  durationMs?: number;
}

export interface CompactionSummarizeOptions {
  abortSignal?: AbortSignal;
}

/** One compaction round in sessions/<id>/compaction-ledger.jsonl. */
export interface CompactionLedgerRecord {
  ts: string;
  runId?: string;
  step: number;
  compactionCount: number;
  strategy: "llm";
  retainedMessages: number;
  retainedObservations: number;
  evictedMessages: number;
  evictedObservations: number;
  durationMs?: number;
  path?: string;
  model?: string;
  usage?: TokenUsage;
}

export interface CompactionPolicyOverrides {
  charThreshold?: number;
  retainedMessages?: number;
  retainedObservations?: number;
  modelName?: string;
}

/** Merge config/file overrides then env (env wins). */
export function resolveCompactionPolicy(
  ...layers: (CompactionPolicyOverrides | undefined)[]
): CompactionPolicy {
  const merged: CompactionPolicy = { ...DEFAULT_COMPACTION_POLICY };
  for (const layer of layers) {
    if (!layer) {
      continue;
    }
    if (layer.charThreshold !== undefined && layer.charThreshold > 0) {
      merged.charThreshold = layer.charThreshold;
    }
    if (layer.retainedMessages !== undefined && layer.retainedMessages > 0) {
      merged.retainedMessages = layer.retainedMessages;
    }
    if (layer.retainedObservations !== undefined && layer.retainedObservations > 0) {
      merged.retainedObservations = layer.retainedObservations;
    }
    if (layer.modelName) {
      merged.modelName = layer.modelName;
    }
  }
  return resolveCompactionPolicyFromEnv(merged);
}

/** Resolve compaction policy from CODE_MIND_COMPACTION_* env vars. */
export function resolveCompactionPolicyFromEnv(
  base: CompactionPolicy = DEFAULT_COMPACTION_POLICY,
): CompactionPolicy {
  const thresholdRaw = process.env.CODE_MIND_COMPACTION_CHAR_THRESHOLD?.trim();
  const threshold =
    thresholdRaw !== undefined && thresholdRaw.length > 0
      ? Number(thresholdRaw)
      : undefined;
  const modelName = process.env.CODE_MIND_COMPACTION_MODEL?.trim();

  return {
    ...base,
    ...(threshold !== undefined && Number.isFinite(threshold) && threshold > 0
      ? { charThreshold: threshold }
      : {}),
    ...(modelName ? { modelName } : {}),
  };
}

export function resolveCompactionModelNameFromEnv(
  policy: CompactionPolicy = DEFAULT_COMPACTION_POLICY,
): string | undefined {
  const fromEnv = process.env.CODE_MIND_COMPACTION_MODEL?.trim();
  return policy.modelName ?? (fromEnv && fromEnv.length > 0 ? fromEnv : undefined);
}
