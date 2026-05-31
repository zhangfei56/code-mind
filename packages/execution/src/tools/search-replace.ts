import { readFile } from "node:fs/promises";
import type { Tool } from "@code-mind/shared";
import { WRITE_TOOLS_MODES } from "@code-mind/shared";
import { resolvePathInWorkspace } from "@code-mind/workspace";
import { writeWorkspaceFileChange } from "./file-write-helper.js";

interface SearchReplaceArgs {
  path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

function countOccurrences(content: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  let count = 0;
  let start = 0;
  while (true) {
    const index = content.indexOf(needle, start);
    if (index === -1) {
      return count;
    }
    count += 1;
    start = index + needle.length;
  }
}

const searchReplaceSchemaDescription =
  "Replace old_string with new_string in an existing file. By default old_string must match exactly once; set replace_all=true for every occurrence. Prefer apply_patch for multi-line edits.";

export const searchReplaceTool: Tool<SearchReplaceArgs> = {
  name: "search_replace",
  description: searchReplaceSchemaDescription,
  riskLevel: "high",
  availableInModes: WRITE_TOOLS_MODES,
  schema: {
    name: "search_replace",
    description: searchReplaceSchemaDescription,
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path relative to workspace root.",
        },
        old_string: {
          type: "string",
          description: "Exact text to find. Must be unique unless replace_all is true.",
        },
        new_string: {
          type: "string",
          description: "Replacement text.",
        },
        replace_all: {
          type: "boolean",
          description: "Replace every match. Default false (requires exactly one match).",
        },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  async execute(args, context) {
    try {
      const absolutePath = resolvePathInWorkspace(context.workspaceRoot, args.path);
      const before = await readFile(absolutePath, "utf8");
      const occurrences = countOccurrences(before, args.old_string);

      if (occurrences === 0) {
        return {
          success: false,
          output: "",
          error: "search_replace failed: old_string not found",
        };
      }

      if (!args.replace_all && occurrences !== 1) {
        return {
          success: false,
          output: "",
          error: `search_replace failed: old_string matched ${occurrences} times; set replace_all=true or use a more specific old_string`,
        };
      }

      const after = args.replace_all
        ? before.split(args.old_string).join(args.new_string)
        : before.replace(args.old_string, args.new_string);

      const patchContent = `*** Begin Patch
*** Update File: ${args.path}
@@
-${args.old_string}
+${args.new_string}
*** End Patch`;

      return await writeWorkspaceFileChange({
        workspaceRoot: context.workspaceRoot,
        sessionId: context.sessionId,
        relativePath: args.path,
        after,
        patchContent,
        successMessage: `Updated ${args.path}`,
      });
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "search_replace failed",
      };
    }
  },
};
