import type { Tool } from "@code-mind/shared";
import { WRITE_TOOLS_MODES } from "@code-mind/shared";
import { writeWorkspaceFileChange } from "./file-write-helper.js";

interface WriteFileArgs {
  path: string;
  content: string;
}

export const writeFileTool: Tool<WriteFileArgs> = {
  name: "write_file",
  description: "Create or overwrite a workspace file with the provided content.",
  riskLevel: "high",
  availableInModes: WRITE_TOOLS_MODES,
  schema: {
    name: "write_file",
    description: "Create or overwrite a workspace file with the provided content.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
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
