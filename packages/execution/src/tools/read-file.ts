import { readFile } from "node:fs/promises";
import type { Tool } from "@code-mind/shared";
import { READ_TOOLS_MODES } from "@code-mind/shared";
import { canReadFile } from "@code-mind/security";
import { isIgnoredPath } from "@code-mind/workspace";
import { resolvePathInWorkspace } from "@code-mind/workspace";
import { sanitizeToolOutput, truncateToolOutput } from "./output.js";

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

const readFileSchemaDescription =
  "Read a workspace file. Output lines are prefixed with line numbers (`N content`). Use startLine/endLine to slice large files.";

export const readFileTool: Tool<ReadFileArgs> = {
  name: "read_file",
  description: readFileSchemaDescription,
  riskLevel: "low",
  availableInModes: READ_TOOLS_MODES,
  schema: {
    name: "read_file",
    description: readFileSchemaDescription,
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path relative to workspace root.",
        },
        startLine: {
          type: "number",
          description: "First line to include (1-based). Defaults to 1.",
        },
        endLine: {
          type: "number",
          description: "Last line to include (1-based, inclusive). Defaults to end of file.",
        },
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
    const output = truncateToolOutput(
      sanitizeToolOutput(withLineNumbers(content, args.startLine, args.endLine)),
    );

    return {
      success: true,
      output,
      data: { path: args.path },
    };
  },
};
