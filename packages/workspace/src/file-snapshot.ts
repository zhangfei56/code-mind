import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getSnapshotsDir } from "./session-artifacts.js";

export interface FileSnapshotRecord {
  snapshotPath: string;
  relativePath: string;
  artifactId: string;
}

export async function captureFileSnapshot(
  workspaceRoot: string,
  sessionId: string,
  relativePath: string,
  content: string,
): Promise<FileSnapshotRecord> {
  const artifactId = `${Date.now()}`;
  const snapshotsDir = getSnapshotsDir(workspaceRoot, sessionId);
  await mkdir(snapshotsDir, { recursive: true });
  const safeName = relativePath.replace(/[/\\]/g, "__");
  const snapshotPath = join(snapshotsDir, `${artifactId}__${safeName}.snapshot`);
  await writeFile(snapshotPath, content, "utf8");
  return { snapshotPath, relativePath, artifactId };
}

export async function readFileSnapshot(snapshotPath: string): Promise<string> {
  return readFile(snapshotPath, "utf8");
}
