import type { Tool } from "@code-mind/shared";
import { WRITE_TOOLS_MODES } from "@code-mind/shared";
import { moveWorkspaceFile } from "./file-mutation-helper.js";

interface MoveFileArgs {
  from: string;
  to: string;
}

export const moveFileTool: Tool<MoveFileArgs> = {
  name: "move_file",
  description: "Move or rename a workspace file.",
  riskLevel: "high",
  availableInModes: WRITE_TOOLS_MODES,
  schema: {
    name: "move_file",
    description: "Move or rename a workspace file within the workspace.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
      },
      required: ["from", "to"],
    },
  },
  async execute(args, context) {
    try {
      return await moveWorkspaceFile({
        workspaceRoot: context.workspaceRoot,
        sessionId: context.sessionId,
        fromPath: args.from,
        toPath: args.to,
      });
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "move failed",
      };
    }
  },
};
