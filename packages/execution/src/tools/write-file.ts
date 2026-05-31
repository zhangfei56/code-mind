import type { Tool } from "@code-mind/shared";
import { WRITE_TOOLS_MODES } from "@code-mind/shared";
import { writeWorkspaceFileChange } from "./file-write-helper.js";

interface WriteFileArgs {
  path: string;
  content: string;
}

const writeFileSchemaDescription =
  "Create a new file or overwrite an entire file with content. Prefer apply_patch or search_replace when editing existing files.";

export const writeFileTool: Tool<WriteFileArgs> = {
  name: "write_file",
  description: writeFileSchemaDescription,
  riskLevel: "high",
  availableInModes: WRITE_TOOLS_MODES,
  schema: {
    name: "write_file",
    description: writeFileSchemaDescription,
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path relative to workspace root.",
        },
        content: {
          type: "string",
          description: "Full file contents to write.",
        },
      },
      required: ["path", "content"],
    },
  },
  async execute(args, context) {
    try {
      const patchContent = `*** Begin Patch
*** Update File: ${args.path}
@@
+${args.content.replace(/\n/g, "\n+")}
*** End Patch`;

      return await writeWorkspaceFileChange({
        workspaceRoot: context.workspaceRoot,
        sessionId: context.sessionId,
        relativePath: args.path,
        after: args.content,
        patchContent,
        successMessage: `Wrote ${args.path}`,
      });
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "write failed",
      };
    }
  },
};
