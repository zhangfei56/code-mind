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

export function resolveWorkspace(cwd: string): string {
  const resolved = resolve(cwd);
  return findWorkspaceMarker(resolved) ?? resolved;
}
