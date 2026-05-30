import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Tool } from "@code-mind/shared";
import { READ_TOOLS_MODES } from "@code-mind/shared";
import { isIgnoredPath } from "@code-mind/workspace";
import { resolvePathInWorkspace } from "@code-mind/workspace";
import { sanitizeToolOutput, truncateToolOutput } from "./output.js";

interface ListDirArgs {
  path: string;
  depth?: number;
}

async function walk(
  workspaceRoot: string,
  root: string,
  current: string,
  depth: number,
  lines: string[],
): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  const sorted = [...entries].sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  for (const entry of sorted) {
    const absolutePath = join(current, entry.name);
    const displayPath = relative(root, absolutePath) || ".";
    if (isIgnoredPath(workspaceRoot, displayPath)) {
      continue;
    }

    lines.push(entry.isDirectory() ? `${displayPath}/` : displayPath);

    if (entry.isDirectory() && depth > 1) {
      await walk(workspaceRoot, root, absolutePath, depth - 1, lines);
    }
  }
}

export const listDirTool: Tool<ListDirArgs> = {
  name: "list_dir",
  description: "List files and directories inside the workspace.",
  riskLevel: "low",
  availableInModes: READ_TOOLS_MODES,
  schema: {
    name: "list_dir",
    description: "List files and directories inside the workspace.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        depth: { type: "number" },
      },
      required: ["path"],
    },
  },
  async execute(args, context) {
    const target = resolvePathInWorkspace(context.workspaceRoot, args.path);
    const lines: string[] = [];
    await walk(context.workspaceRoot, target, target, args.depth ?? 2, lines);

    return {
      success: true,
      output: truncateToolOutput(sanitizeToolOutput(lines.join("\n"))),
      data: { entries: lines },
    };
  },
};
