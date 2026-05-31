import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Tool } from "@code-mind/shared";
import { READ_TOOLS_MODES } from "@code-mind/shared";
import { isIgnoredPath } from "@code-mind/workspace";
import { resolvePathInWorkspace } from "@code-mind/workspace";
import { sanitizeToolOutput, truncateToolOutput } from "./output.js";

interface GlobArgs {
  pattern: string;
  path?: string;
  maxResults?: number;
}

const DEFAULT_MAX_RESULTS = 200;

export function globPatternToRegExp(pattern: string): RegExp {
  let regex = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern.charAt(index);
    if (char === "") {
      continue;
    }
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        if (pattern[index + 2] === "/") {
          regex += "(?:.*/)?";
          index += 2;
        } else {
          regex += ".*";
          index += 1;
        }
      } else {
        regex += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      regex += "[^/]";
      continue;
    }
    if ("+^${}()|.[]\\".includes(char)) {
      regex += `\\${char}`;
      continue;
    }
    regex += char;
  }
  regex += "$";
  return new RegExp(regex);
}

async function collectMatchingFiles(
  workspaceRoot: string,
  root: string,
  current: string,
  matcher: RegExp,
  matches: string[],
  maxResults: number,
): Promise<void> {
  if (matches.length >= maxResults) {
    return;
  }

  const entries = await readdir(current, { withFileTypes: true });
  const sorted = [...entries].sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of sorted) {
    if (matches.length >= maxResults) {
      return;
    }

    const absolutePath = join(current, entry.name);
    const displayPath = relative(root, absolutePath) || ".";
    if (isIgnoredPath(workspaceRoot, displayPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await collectMatchingFiles(
        workspaceRoot,
        root,
        absolutePath,
        matcher,
        matches,
        maxResults,
      );
      continue;
    }

    if (matcher.test(displayPath)) {
      matches.push(displayPath);
    }
  }
}

export const globTool: Tool<GlobArgs> = {
  name: "glob",
  description: "Find workspace files whose paths match a glob pattern.",
  riskLevel: "low",
  availableInModes: READ_TOOLS_MODES,
  schema: {
    name: "glob",
    description:
      "Find workspace files whose paths match a glob pattern such as **/*.ts or src/**/*.test.ts.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        path: { type: "string" },
        maxResults: { type: "number" },
      },
      required: ["pattern"],
    },
  },
  async execute(args, context) {
    const root = resolvePathInWorkspace(context.workspaceRoot, args.path ?? ".");
    const maxResults = Math.max(1, Math.min(args.maxResults ?? DEFAULT_MAX_RESULTS, 500));
    const matcher = globPatternToRegExp(args.pattern);
    const matches: string[] = [];
    await collectMatchingFiles(
      context.workspaceRoot,
      root,
      root,
      matcher,
      matches,
      maxResults,
    );

    const truncated = matches.length >= maxResults;
    const lines = [...matches];
    if (truncated) {
      lines.push(`... truncated at ${maxResults} results`);
    }

    return {
      success: true,
      output: truncateToolOutput(sanitizeToolOutput(lines.join("\n") || "(no matches)")),
      data: { matches, truncated },
    };
  },
};
