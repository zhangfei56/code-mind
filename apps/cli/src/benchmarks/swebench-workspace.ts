import { execFile } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { BenchmarkCase, SwebenchRef } from "./benchmark-types.js";

function shouldCopySwebenchPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return !["/node_modules", "/dist", "/coverage", "/.DS_Store", "/.agent"].some((segment) =>
    normalized.includes(segment),
  );
}

const execFileAsync = promisify(execFile);
const CACHE_ROOT = "benchmarks/.cache/swebench-repos";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function repoCacheDir(root: string, repo: string): string {
  return join(root, CACHE_ROOT, repo.replace("/", "__"));
}

async function ensureRepoCheckout(root: string, ref: SwebenchRef): Promise<string> {
  const cacheDir = repoCacheDir(root, ref.repo);
  await mkdir(join(root, CACHE_ROOT), { recursive: true });

  if (!(await pathExists(join(cacheDir, ".git")))) {
    const cloneUrl = `https://github.com/${ref.repo}.git`;
    await execFileAsync("git", ["clone", "--filter=blob:none", cloneUrl, cacheDir], {
      timeout: 600_000,
    });
  }

  await execFileAsync("git", ["fetch", "origin", ref.baseCommit], { cwd: cacheDir, timeout: 300_000 });
  await execFileAsync("git", ["checkout", "--force", ref.baseCommit], { cwd: cacheDir, timeout: 120_000 });
  return cacheDir;
}

export async function prepareSwebenchWorkspace(
  root: string,
  item: BenchmarkCase,
  ref: SwebenchRef,
): Promise<{ workspaceRoot: string; cleanup: () => Promise<void>; prompt: string }> {
  const sourceRepo = await ensureRepoCheckout(root, ref);
  const tempRoot = await mkdtemp(join(tmpdir(), `code-mind-swebench-${item.id}-`));
  const workspaceRoot = join(tempRoot, ref.instanceId.replace(/[^a-z0-9_-]+/gi, "-"));
  await cp(sourceRepo, workspaceRoot, {
    recursive: true,
    filter: shouldCopySwebenchPath,
  });

  let prompt = item.prompt.trim();
  if (prompt.length === 0) {
    const instancePath = join(root, "benchmarks", "vendor", "swebench-dev-instances.json");
    if (await pathExists(instancePath)) {
      const instances = JSON.parse(await readFile(instancePath, "utf8")) as Array<{
        instance_id: string;
        problem_statement: string;
      }>;
      const match = instances.find((entry) => entry.instance_id === ref.instanceId);
      prompt = match?.problem_statement?.trim() ?? "";
    }
  }
  if (prompt.length === 0) {
    prompt = `Fix GitHub issue ${ref.instanceId} in ${ref.repo} at commit ${ref.baseCommit.slice(0, 7)}.`;
  }

  const fullPrompt = [
    prompt,
    "",
    "Make the smallest change needed so the failing tests pass.",
    "Do not modify test files unless explicitly required.",
  ].join("\n");

  return {
    workspaceRoot,
    prompt: fullPrompt,
    async cleanup() {
      await rm(tempRoot, { recursive: true, force: true });
    },
  };
}

export async function captureWorkspacePatch(workspaceRoot: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "HEAD"], {
      cwd: workspaceRoot,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.trim();
  } catch {
    return "";
  }
}
