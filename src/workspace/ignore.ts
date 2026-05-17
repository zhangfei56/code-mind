const DEFAULT_IGNORED_PREFIXES = [
  "node_modules/",
  ".git/",
  "dist/",
  "dist-tests/",
  ".agent/",
] as const;

const workspaceIgnoreCache = new Map<string, readonly string[]>();

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function getIgnoredPrefixes(workspaceRoot: string): readonly string[] {
  const cached = workspaceIgnoreCache.get(workspaceRoot);
  if (cached) {
    return cached;
  }

  workspaceIgnoreCache.set(workspaceRoot, DEFAULT_IGNORED_PREFIXES);
  return DEFAULT_IGNORED_PREFIXES;
}

export function isIgnoredPath(workspaceRoot: string, path: string): boolean {
  const normalized = normalizePath(path);
  return getIgnoredPrefixes(workspaceRoot).some((prefix) =>
    normalized === prefix.slice(0, -1) || normalized.startsWith(prefix),
  );
}

export function clearWorkspaceIgnoreCache(): void {
  workspaceIgnoreCache.clear();
}
