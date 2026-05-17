import { readFile } from "node:fs/promises";
import type { Tool } from "../shared/types.js";
import { canReadFile } from "../permissions/file-rules.js";
import { isIgnoredPath } from "../workspace/ignore.js";
import { resolvePathInWorkspace } from "../workspace/sandbox-path.js";

interface ReadFileArgs {
  path: string;
  startLine?: number;
  endLine?: number;
}

function withLineNumbers(content: string, startLine = 1, endLine?: number): string {
  const lines = content.split("\n");
  const sliceStart = Math.max(startLine - 1, 0);
  const sliceEnd = endLine === undefined ? lines.length : Math.min(endLine, lines.length);

  return lines
    .slice(sliceStart, sliceEnd)
    .map((line, index) => `${sliceStart + index + 1} ${line}`)
    .join("\n");
}

export const readFileTool: Tool<ReadFileArgs> = {
  name: "read_file",
  description: "Read a file from the workspace.",
  riskLevel: "low",
  schema: {
    name: "read_file",
    description: "Read a file from the workspace.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        startLine: { type: "number" },
        endLine: { type: "number" },
      },
      required: ["path"],
    },
  },
  async execute(args, context) {
    if (!canReadFile(args.path)) {
      return {
        success: false,
        output: "",
        error: "Access denied",
      };
    }

    if (isIgnoredPath(context.workspaceRoot, args.path)) {
      return {
        success: false,
        output: "",
        error: "Path is ignored",
      };
    }

    const target = resolvePathInWorkspace(context.workspaceRoot, args.path);
    const content = await readFile(target, "utf8");
    const output = withLineNumbers(content, args.startLine, args.endLine);

    return {
      success: true,
      output,
      data: { path: args.path },
    };
  },
};
