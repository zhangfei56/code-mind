import { writeFile } from "node:fs/promises";
import { readFileSnapshot } from "./file-snapshot.js";
import { resolvePathInWorkspace } from "./sandbox-path.js";

export class RollbackManager {
  constructor(
    private readonly workspaceRoot: string,
    private readonly sessionId: string,
  ) {}

  async rollbackFromSnapshot(
    relativePath: string,
    snapshotPath: string,
  ): Promise<void> {
    const content = await readFileSnapshot(snapshotPath);
    const absolutePath = resolvePathInWorkspace(this.workspaceRoot, relativePath);
    await writeFile(absolutePath, content, "utf8");
  }
}
