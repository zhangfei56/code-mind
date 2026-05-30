import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { WorktreeInfo } from "@code-mind/shared";
import { nowIso } from "@code-mind/shared";

const execFileAsync = promisify(execFile);

async function runGit(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd,
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  return result.stdout.trim();
}

export class WorktreeManager {
  async create(
    workspaceRoot: string,
    taskId: string,
    branchName = `agent/${taskId}`,
    baseRef = "HEAD",
  ): Promise<WorktreeInfo> {
    const baseDir = join(workspaceRoot, ".agent", "worktrees");
    const path = join(baseDir, taskId);
    await mkdir(baseDir, { recursive: true });
    await runGit(workspaceRoot, ["worktree", "add", "-b", branchName, path, baseRef]);

    const info: WorktreeInfo = {
      taskId,
      path,
      branchName,
      baseRef,
      createdAt: nowIso(),
    };
    await writeFile(
      join(path, "..", `${taskId}.json`),
      `${JSON.stringify(info, null, 2)}\n`,
      "utf8",
    );
    return info;
  }

  async diff(worktreePath: string): Promise<string> {
    return runGit(worktreePath, ["diff"]);
  }

  async status(worktreePath: string): Promise<string> {
    return runGit(worktreePath, ["status", "--short"]);
  }

  async cleanup(workspaceRoot: string, taskId: string): Promise<void> {
    const path = join(workspaceRoot, ".agent", "worktrees", taskId);
    await runGit(workspaceRoot, ["worktree", "remove", "--force", path]);
    await rm(path, { recursive: true, force: true });
  }
}
