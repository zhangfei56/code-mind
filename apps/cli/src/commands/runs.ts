import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { listRunIds, readRunEvents, readRunManifest } from "@code-mind/observability";
import { resolveWorkspace } from "@code-mind/workspace";

export async function renderRunsList(workspaceRoot: string): Promise<string> {
  const runIds = await listRunIds(workspaceRoot);
  if (runIds.length === 0) {
    return "No runs found.";
  }
  const lines = ["Runs:"];
  for (const runId of runIds.reverse()) {
    const manifest = await readRunManifest(workspaceRoot, runId);
    if (!manifest) {
      continue;
    }
    lines.push(
      `  ${runId} · ${manifest.status} · ${manifest.task.slice(0, 60)} · ${manifest.startedAt}`,
    );
  }
  return lines.join("\n");
}

export async function renderRunShow(workspaceRoot: string, runId: string): Promise<string> {
  const manifest = await readRunManifest(workspaceRoot, runId);
  if (!manifest) {
    return `Run ${runId} not found.`;
  }
  const events = await readRunEvents(workspaceRoot, runId);
  const summaryPath = join(workspaceRoot, ".agent", "runs", runId, "summary.json");
  let summary = "";
  try {
    summary = await readFile(summaryPath, "utf8");
  } catch {
    summary = "(no summary yet)";
  }
  return [
    `Run ${runId}`,
    `  session: ${manifest.sessionId}`,
    `  status: ${manifest.status}`,
    `  events: .agent/runs/${runId}/events.jsonl (${events.length} events)`,
    `  summary:`,
    summary,
  ].join("\n");
}

export async function executeRunsList(cwd: string): Promise<number> {
  const workspaceRoot = resolveWorkspace(cwd);
  console.log(await renderRunsList(workspaceRoot));
  return 0;
}

export async function executeRunShow(cwd: string, runId: string): Promise<number> {
  const workspaceRoot = resolveWorkspace(cwd);
  console.log(await renderRunShow(workspaceRoot, runId));
  return 0;
}
