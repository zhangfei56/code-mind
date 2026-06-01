import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { isIgnoredPath } from "@code-mind/workspace";

const ENTRY_FILE_PATTERN =
  /^(readme\.md|agents\.md|package\.json|pyproject\.toml|cargo\.toml|go\.mod|tsconfig\.json)$/i;

export interface RepoMapOptions {
  maxDepth?: number;
  maxEntries?: number;
}

async function walkRepo(
  workspaceRoot: string,
  current: string,
  depth: number,
  options: Required<RepoMapOptions>,
  state: { lines: string[]; count: number },
): Promise<void> {
  if (state.count >= options.maxEntries || depth > options.maxDepth) {
    return;
  }

  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return;
  }

  const sorted = [...entries].sort((left, right) => {
    if (left.isDirectory() !== right.isDirectory()) {
      return left.isDirectory() ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

  for (const entry of sorted) {
    if (state.count >= options.maxEntries) {
      state.lines.push("... (truncated)");
      return;
    }

    const absolutePath = join(current, entry.name);
    const displayPath = relative(workspaceRoot, absolutePath) || ".";
    if (isIgnoredPath(workspaceRoot, displayPath)) {
      continue;
    }

    const indent = "  ".repeat(Math.max(0, depth));
    if (entry.isDirectory()) {
      state.lines.push(`${indent}${entry.name}/`);
      state.count += 1;
      await walkRepo(workspaceRoot, absolutePath, depth + 1, options, state);
    } else {
      const marker = ENTRY_FILE_PATTERN.test(entry.name) ? " *" : "";
      state.lines.push(`${indent}${entry.name}${marker}`);
      state.count += 1;
    }
  }
}

/** Lightweight repo index for prompt injection (TOOL-06 / CTX-01). */
export async function buildRepoMap(
  workspaceRoot: string,
  options: RepoMapOptions = {},
): Promise<string> {
  const resolved = {
    maxDepth: options.maxDepth ?? 2,
    maxEntries: options.maxEntries ?? 80,
  };
  const state = { lines: [] as string[], count: 0 };
  await walkRepo(workspaceRoot, workspaceRoot, 0, resolved, state);

  if (state.lines.length === 0) {
    return "Repo map: (empty workspace)";
  }

  return [
    "Repo map (* = entry/manifest file):",
    ...state.lines,
    "",
    "Use this map to narrow scope before editing; do not scan ignored dirs (node_modules, .git, dist).",
  ].join("\n");
}
