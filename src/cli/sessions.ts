import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FileSessionStore } from "../session/session-store.js";

export async function renderSessionList(workspaceRoot: string): Promise<string> {
  const store = new FileSessionStore(workspaceRoot);
  const sessions = await store.listSessionManifests();

  if (sessions.length === 0) {
    return "No sessions found.";
  }

  return sessions
    .map(
      (session) =>
        `${session.id}  ${session.status}  ${session.mode}  ${session.updatedAt}  ${session.task}`,
    )
    .join("\n");
}

export async function renderSessionShow(
  workspaceRoot: string,
  sessionId: string,
): Promise<string> {
  const store = new FileSessionStore(workspaceRoot);
  const manifest = await store.readManifest(sessionId);
  const currentSummaryPath = join(
    store.getSessionDir(sessionId),
    "current-summary.md",
  );

  let currentSummary = "";
  try {
    currentSummary = await readFile(currentSummaryPath, "utf8");
  } catch {
    currentSummary = "";
  }

  return [
    JSON.stringify(manifest, null, 2),
    currentSummary.trim().length > 0 ? currentSummary.trim() : "No current summary available.",
  ].join("\n\n");
}
