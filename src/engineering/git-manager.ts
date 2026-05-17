import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitChangedFiles, GitStatusSummary } from "../shared/types.js";
import { sanitizeToolOutput, truncateToolOutput } from "../tools/output.js";

const execFileAsync = promisify(execFile);

async function runGit(
  cwd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync("git", args, {
    cwd,
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  return {
    stdout: sanitizeToolOutput(result.stdout),
    stderr: sanitizeToolOutput(result.stderr),
  };
}

export class GitManager {
  async status(cwd: string): Promise<GitStatusSummary> {
    const branch = (await runGit(cwd, ["branch", "--show-current"])).stdout.trim() || "HEAD";
    const porcelain = (await runGit(cwd, ["status", "--porcelain"])).stdout;
    const modified: string[] = [];
    const untracked: string[] = [];
    const deleted: string[] = [];

    for (const line of porcelain.split("\n").filter(Boolean)) {
      const code = line.slice(0, 2);
      const path = line.slice(3).trim();
      if (code === "??") {
        untracked.push(path);
        continue;
      }
      if (code.includes("D")) {
        deleted.push(path);
        continue;
      }
      modified.push(path);
    }

    return {
      branch,
      clean: porcelain.trim().length === 0,
      modified,
      untracked,
      deleted,
    };
  }

  async diff(cwd: string, path?: string, staged = false): Promise<string> {
    const args = ["diff"];
    if (staged) {
      args.push("--staged");
    }
    if (path) {
      args.push("--", path);
    }
    const result = await runGit(cwd, args);
    return truncateToolOutput(result.stdout || result.stderr);
  }

  async log(cwd: string, limit = 5): Promise<string> {
    const result = await runGit(cwd, ["log", `-n${limit}`, "--oneline"]);
    return truncateToolOutput(result.stdout);
  }

  async show(cwd: string, ref = "HEAD"): Promise<string> {
    const result = await runGit(cwd, ["show", "--stat", "--oneline", ref]);
    return truncateToolOutput(result.stdout);
  }

  async changedFiles(cwd: string): Promise<GitChangedFiles> {
    const status = await this.status(cwd);
    return {
      modified: status.modified,
      created: [],
      deleted: status.deleted,
      untracked: status.untracked,
    };
  }

  async restoreFile(cwd: string, path: string): Promise<string> {
    await runGit(cwd, ["restore", "--", path]);
    return `Restored ${path}`;
  }
}
