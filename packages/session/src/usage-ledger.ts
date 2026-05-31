import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ModelUsageRecord, SessionManifest, SessionUsageSummary } from "@code-mind/shared";
import { mergeSessionUsageSummary, nowIso } from "@code-mind/shared";

const USAGE_LEDGER_FILE = "usage-ledger.jsonl";

export async function appendModelUsageRecord(
  sessionDir: string,
  record: ModelUsageRecord,
): Promise<void> {
  await mkdir(sessionDir, { recursive: true });
  await appendFile(
    join(sessionDir, USAGE_LEDGER_FILE),
    `${JSON.stringify(record)}\n`,
    "utf8",
  );
}

export function buildUsageSummaryUpdate(
  manifest: SessionManifest,
  record: ModelUsageRecord,
): SessionUsageSummary {
  return mergeSessionUsageSummary(manifest.usageSummary, record.usage, {
    modelCalls: 1,
    updatedAt: record.ts,
  });
}

export function buildUsageSummaryFromRun(
  manifest: SessionManifest,
  usage: ModelUsageRecord["usage"],
  modelCalls: number,
): SessionUsageSummary {
  return mergeSessionUsageSummary(manifest.usageSummary, usage, {
    modelCalls,
    updatedAt: nowIso(),
  });
}
