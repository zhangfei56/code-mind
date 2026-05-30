import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getAgentSessionsRoot, getSessionIndexPath } from "@code-mind/workspace";
import { nowIso } from "@code-mind/shared";

export interface SessionIndex {
  sessionId: string;
  projectPath: string;
  runIds: string[];
  lastRunId?: string;
  createdAt: string;
  updatedAt: string;
}

export async function readSessionIndex(
  workspaceRoot: string,
  sessionId: string,
): Promise<SessionIndex | undefined> {
  try {
    const content = await readFile(getSessionIndexPath(workspaceRoot, sessionId), "utf8");
    return JSON.parse(content) as SessionIndex;
  } catch {
    return undefined;
  }
}

export async function writeSessionIndex(
  workspaceRoot: string,
  index: SessionIndex,
): Promise<void> {
  const path = getSessionIndexPath(workspaceRoot, index.sessionId);
  await mkdir(getAgentSessionsRoot(workspaceRoot), { recursive: true });
  await writeFile(path, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

export async function appendRunToSessionIndex(
  workspaceRoot: string,
  sessionId: string,
  runId: string,
  projectPath: string,
): Promise<SessionIndex> {
  const existing = await readSessionIndex(workspaceRoot, sessionId);
  const timestamp = nowIso();
  const next: SessionIndex = existing ?? {
    sessionId,
    projectPath,
    runIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  if (!next.runIds.includes(runId)) {
    next.runIds.push(runId);
  }
  next.lastRunId = runId;
  next.updatedAt = timestamp;
  await writeSessionIndex(workspaceRoot, next);
  return next;
}

export async function listSessionIndexes(workspaceRoot: string): Promise<SessionIndex[]> {
  const { readdir } = await import("node:fs/promises");
  const root = getAgentSessionsRoot(workspaceRoot);
  let entries: string[] = [];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }
  const indexes = await Promise.all(
    entries
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => readSessionIndex(workspaceRoot, name.replace(/\.json$/, ""))),
  );
  return indexes
    .filter((value): value is SessionIndex => value !== undefined)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
