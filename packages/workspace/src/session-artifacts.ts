import { join } from "node:path";

export function getAgentRoot(workspaceRoot: string): string {
  return join(workspaceRoot, ".agent");
}

export function getRunsRoot(workspaceRoot: string): string {
  return join(getAgentRoot(workspaceRoot), "runs");
}

export function getRunDir(workspaceRoot: string, runId: string): string {
  return join(getRunsRoot(workspaceRoot), runId);
}

export function getRunArtifactsDir(workspaceRoot: string, runId: string): string {
  return join(getRunDir(workspaceRoot, runId), "artifacts");
}

export function getSessionIndexPath(workspaceRoot: string, sessionId: string): string {
  return join(getAgentSessionsRoot(workspaceRoot), `${sessionId}.json`);
}

export function getAgentSessionsRoot(workspaceRoot: string): string {
  return join(workspaceRoot, ".agent", "sessions");
}

export function getSessionDir(workspaceRoot: string, sessionId: string): string {
  return join(getAgentSessionsRoot(workspaceRoot), sessionId);
}

export function getPatchesDir(workspaceRoot: string, sessionId: string): string {
  return join(getSessionDir(workspaceRoot, sessionId), "patches");
}

export function getDiffsDir(workspaceRoot: string, sessionId: string): string {
  return join(getSessionDir(workspaceRoot, sessionId), "diffs");
}

export function getSnapshotsDir(workspaceRoot: string, sessionId: string): string {
  return join(getSessionDir(workspaceRoot, sessionId), "snapshots");
}

export function getCompactDir(workspaceRoot: string, sessionId: string): string {
  return join(getSessionDir(workspaceRoot, sessionId), "compact");
}
