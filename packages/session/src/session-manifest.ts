import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentSessionsRoot, getSessionDir as getWorkspaceSessionDir } from "@code-mind/workspace";
import type { SessionManifest } from "@code-mind/shared";
import { nowIso } from "@code-mind/shared";

/** Manifest persistence: session.json read/write/update/list. */
export class SessionManifestStore {
  constructor(private readonly workspaceRoot: string) {}

  getSessionDir(sessionId: string): string {
    return getWorkspaceSessionDir(this.workspaceRoot, sessionId);
  }

  async read(sessionId: string): Promise<SessionManifest> {
    const manifestPath = join(this.getSessionDir(sessionId), "session.json");
    const content = await readFile(manifestPath, "utf8");
    return JSON.parse(content) as SessionManifest;
  }

  async write(manifest: SessionManifest): Promise<void> {
    await mkdir(this.getSessionDir(manifest.id), { recursive: true });
    await writeFile(
      join(this.getSessionDir(manifest.id), "session.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  }

  async update(
    sessionId: string,
    updates: Partial<Omit<SessionManifest, "id" | "createdAt">>,
  ): Promise<SessionManifest> {
    const current = await this.read(sessionId);
    const next = {
      ...current,
      ...updates,
      updatedAt: nowIso(),
    } satisfies SessionManifest;
    await this.write(next);
    return next;
  }

  async list(): Promise<SessionManifest[]> {
    const sessionsRoot = getAgentSessionsRoot(this.workspaceRoot);
    let entries: string[] = [];
    try {
      entries = await readdir(sessionsRoot);
    } catch {
      return [];
    }

    const manifests = await Promise.all(
      entries.map(async (sessionId) => {
        try {
          return await this.read(sessionId);
        } catch {
          return null;
        }
      }),
    );

    return manifests
      .filter((value): value is SessionManifest => value !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
}
