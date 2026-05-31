import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { CompactionLedgerRecord } from "@code-mind/shared";

const COMPACTION_LEDGER_FILE = "compaction-ledger.jsonl";

export async function appendCompactionLedgerRecord(
  sessionDir: string,
  record: CompactionLedgerRecord,
): Promise<void> {
  await mkdir(sessionDir, { recursive: true });
  await appendFile(
    join(sessionDir, COMPACTION_LEDGER_FILE),
    `${JSON.stringify(record)}\n`,
    "utf8",
  );
}
