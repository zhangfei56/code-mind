import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentEvent } from "@code-mind/shared";
import { getRunDir } from "@code-mind/workspace";

export async function appendRunEvent(
  workspaceRoot: string,
  runId: string,
  event: AgentEvent,
): Promise<void> {
  const dir = getRunDir(workspaceRoot, runId);
  await mkdir(dir, { recursive: true });
  await appendFile(join(dir, "events.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
}
