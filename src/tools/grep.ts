import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Tool } from "../shared/types.js";
import { isIgnoredPath } from "../workspace/ignore.js";
import { resolvePathInWorkspace } from "../workspace/sandbox-path.js";
import { sanitizeToolOutput, truncateToolOutput } from "./output.js";

interface GrepArgs {
  pattern: string;
  path?: string;
  include?: string;
}

async function collectFiles(
  workspaceRoot: string,
  root: string,
  current: string,
  result: string[],
): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = join(current, entry.name);
    const relativePath = relative(root, absolutePath);
    if (isIgnoredPath(workspaceRoot, relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await collectFiles(workspaceRoot, root, absolutePath, result);
      continue;
    }
    result.push(relativePath);
  }
}

function matchesInclude(filePath: string, include?: string): boolean {
  if (!include) {
    return true;
  }

  if (include.startsWith("*.")) {
    return filePath.endsWith(include.slice(1));
  }

  return filePath.includes(include);
}

export const grepTool: Tool<GrepArgs> = {
  name: "grep",
  description: "Search text in workspace files.",
  riskLevel: "low",
  schema: {
    name: "grep",
    description: "Search text in workspace files.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        path: { type: "string" },
        include: { type: "string" },
      },
      required: ["pattern"],
    },
  },
  async execute(args, context) {
    const root = resolvePathInWorkspace(
      context.workspaceRoot,
      args.path ?? ".",
    );
    const files: string[] = [];
    await collectFiles(context.workspaceRoot, root, root, files);

    const matches: string[] = [];

    for (const filePath of files) {
      if (!matchesInclude(filePath, args.include)) {
        continue;
      }

      const absolutePath = join(root, filePath);
      const content = await readFile(absolutePath, "utf8");
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        if (line.includes(args.pattern)) {
          matches.push(`${filePath}:${index + 1}:${line}`);
        }
      });
    }

    return {
      success: true,
      output: truncateToolOutput(sanitizeToolOutput(matches.join("\n"))),
      data: { matches },
    };
  },
};
