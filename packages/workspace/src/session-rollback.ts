import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { getSnapshotsDir } from "./session-artifacts.js";
import { RollbackManager } from "./rollback-manager.js";

const SNAPSHOT_SUFFIX = ".snapshot";

export interface SessionSnapshotBaseline {
  relativePath: string;
  snapshotPath: string;
  artifactId: string;
}

function parseSnapshotFilename(
  filename: string,
): { artifactId: string; relativePath: string } | null {
  if (!filename.endsWith(SNAPSHOT_SUFFIX)) {
    return null;
  }
  const base = filename.slice(0, -SNAPSHOT_SUFFIX.length);
  const separator = base.indexOf("__");
  if (separator <= 0) {
    return null;
  }
  const artifactId = base.slice(0, separator);
  const relativePath = base.slice(separator + 2).replace(/__/g, "/");
  return { artifactId, relativePath };
}

export async function listSessionSnapshotBaselines(
  workspaceRoot: string,
  sessionId: string,
): Promise<SessionSnapshotBaseline[]> {
  const snapshotsDir = getSnapshotsDir(workspaceRoot, sessionId);
  let files: string[];
  try {
    files = await readdir(snapshotsDir);
  } catch {
    return [];
  }

  const earliestByPath = new Map<string, SessionSnapshotBaseline>();
  for (const file of files) {
    const parsed = parseSnapshotFilename(file);
    if (!parsed) {
      continue;
    }
    const existing = earliestByPath.get(parsed.relativePath);
    const candidate: SessionSnapshotBaseline = {
      relativePath: parsed.relativePath,
      snapshotPath: join(snapshotsDir, file),
      artifactId: parsed.artifactId,
    };
    if (!existing || parsed.artifactId < existing.artifactId) {
      earliestByPath.set(parsed.relativePath, candidate);
    }
  }

  return [...earliestByPath.values()].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

export interface SessionRollbackResult {
  reverted: string[];
  skipped: boolean;
}

export async function rollbackSessionChanges(
  workspaceRoot: string,
  sessionId: string,
): Promise<SessionRollbackResult> {
  const baselines = await listSessionSnapshotBaselines(workspaceRoot, sessionId);
  if (baselines.length === 0) {
    return { reverted: [], skipped: true };
  }

  const manager = new RollbackManager(workspaceRoot, sessionId);
  const reverted: string[] = [];
  for (const baseline of baselines) {
    await manager.rollbackFromSnapshot(baseline.relativePath, baseline.snapshotPath);
    reverted.push(baseline.relativePath);
  }
  return { reverted, skipped: false };
}
