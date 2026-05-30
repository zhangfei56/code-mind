import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function findWorkspaceMarker(startDir: string): string | null {
  let current = startDir;

  while (true) {
    if (existsSync(join(current, ".git"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function hasProjectMarker(dir: string): boolean {
  return [
    "package.json",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
    "AGENTS.md",
    "README.md",
  ].some((file) => existsSync(join(dir, file)));
}

export function resolveWorkspace(cwd: string): string {
  const resolved = resolve(cwd);
  if (hasProjectMarker(resolved)) {
    return resolved;
  }
  return findWorkspaceMarker(resolved) ?? resolved;
}
