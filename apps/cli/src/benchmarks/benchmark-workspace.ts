import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { BenchmarkCase, BenchmarkSetupFile } from "./benchmark-types.js";

export function shouldCopyBenchmarkPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return ![
    "/.git",
    "/.agent",
    "/node_modules",
    "/dist",
    "/coverage",
    "/.DS_Store",
  ].some((segment) => normalized.includes(segment));
}

export async function createIsolatedWorkspace(
  sourceWorkspace: string,
  caseId: string,
): Promise<{ workspaceRoot: string; cleanup: () => Promise<void> }> {
  const tempRoot = await mkdtemp(join(tmpdir(), `code-mind-benchmark-${caseId}-`));
  const workspaceRoot = join(tempRoot, basename(sourceWorkspace));
  await cp(sourceWorkspace, workspaceRoot, {
    recursive: true,
    filter: shouldCopyBenchmarkPath,
  });
  return {
    workspaceRoot,
    async cleanup() {
      await rm(tempRoot, { recursive: true, force: true });
    },
  };
}

export async function applyBenchmarkSetup(
  workspaceRoot: string,
  files: BenchmarkSetupFile[] | undefined,
): Promise<void> {
  if (!files || files.length === 0) {
    return;
  }

  for (const file of files) {
    const destination = join(workspaceRoot, file.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.content, "utf8");
  }
}

export async function prepareBenchmarkWorkspace(
  sourceWorkspace: string,
  item: BenchmarkCase,
): Promise<{ workspaceRoot: string; cleanup: () => Promise<void> }> {
  const isolated = await createIsolatedWorkspace(sourceWorkspace, item.id);
  await applyBenchmarkSetup(isolated.workspaceRoot, item.setupFiles);
  return isolated;
}
