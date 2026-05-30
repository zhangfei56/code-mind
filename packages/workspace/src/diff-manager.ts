import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getDiffsDir, getPatchesDir } from "./session-artifacts.js";

export interface PatchArtifact {
  artifactId: string;
  patchPath: string;
  diffPath: string;
  filePath: string;
}

export class DiffManager {
  constructor(
    private readonly workspaceRoot: string,
    private readonly sessionId: string,
  ) {}

  getDiffsDir(): string {
    return getDiffsDir(this.workspaceRoot, this.sessionId);
  }

  getPatchesDir(): string {
    return getPatchesDir(this.workspaceRoot, this.sessionId);
  }

  async ensureDirs(): Promise<void> {
    await mkdir(this.getPatchesDir(), { recursive: true });
    await mkdir(this.getDiffsDir(), { recursive: true });
  }

  async recordPatch(patch: string, filePath: string): Promise<PatchArtifact> {
    const artifactId = `${Date.now()}`;
    await this.ensureDirs();
    const patchPath = join(this.getPatchesDir(), `${artifactId}.patch`);
    const diffPath = join(this.getDiffsDir(), `${artifactId}.diff`);
    await writeFile(patchPath, patch, "utf8");
    await writeFile(diffPath, patch, "utf8");
    return { artifactId, patchPath, diffPath, filePath };
  }

  async readLatestDiff(): Promise<string | null> {
    let files: string[];
    try {
      files = await readdir(this.getDiffsDir());
    } catch {
      return null;
    }
    const diffFiles = files.filter((file) => file.endsWith(".diff")).sort();
    if (diffFiles.length === 0) {
      return null;
    }
    return readFile(
      join(this.getDiffsDir(), diffFiles[diffFiles.length - 1] ?? ""),
      "utf8",
    );
  }
}
