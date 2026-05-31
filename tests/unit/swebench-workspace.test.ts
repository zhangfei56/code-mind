import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureWorkspacePatch } from "../../apps/cli/src/benchmarks/swebench-workspace.js";

export async function runSwebenchWorkspaceTests(): Promise<void> {
  const tempRoot = await mkdtemp(join(tmpdir(), "code-mind-swebench-ws-"));
  const sourceRepo = join(tempRoot, "source");
  const workspaceRoot = join(tempRoot, "workspace");

  try {
    await mkdir(sourceRepo, { recursive: true });
    execFileSync("git", ["init"], { cwd: sourceRepo });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: sourceRepo });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: sourceRepo });
    await writeFile(join(sourceRepo, "README.md"), "hello\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd: sourceRepo });
    execFileSync("git", ["commit", "-m", "init"], { cwd: sourceRepo });
    await writeFile(join(sourceRepo, "README.md"), "hello world\n", "utf8");

    await cp(sourceRepo, workspaceRoot, {
      recursive: true,
      filter: (path) => !path.replaceAll("\\", "/").includes("/node_modules"),
    });

    const { access } = await import("node:fs/promises");
    await access(join(workspaceRoot, ".git"));

    const patch = await captureWorkspacePatch(workspaceRoot);
    assert.match(patch, /hello world/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
