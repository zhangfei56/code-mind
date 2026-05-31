import type { Tool } from "@code-mind/shared";
import { WRITE_TOOLS_MODES } from "@code-mind/shared";
import { deleteWorkspaceFile } from "./file-mutation-helper.js";

interface DeleteFileArgs {
  path: string;
}

export const deleteFileTool: Tool<DeleteFileArgs> = {
  name: "delete_file",
  description: "Delete a workspace file.",
  riskLevel: "high",
  availableInModes: WRITE_TOOLS_MODES,
  schema: {
    name: "delete_file",
    description: "Delete a workspace file.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
    },
  },
  async execute(args, context) {
    try {
      return await deleteWorkspaceFile({
        workspaceRoot: context.workspaceRoot,
        sessionId: context.sessionId,
        relativePath: args.path,
      });
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "delete failed",
      };
    }
  },
};
