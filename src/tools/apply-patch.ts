import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Tool } from "../shared/types.js";
import { resolvePathInWorkspace } from "../workspace/sandbox-path.js";

interface ApplyPatchArgs {
  patch: string;
}

interface ParsedPatch {
  filePath: string;
  oldText: string;
  newText: string;
}

function parsePatch(patch: string): ParsedPatch {
  const lines = patch.split("\n");
  const fileLine = lines.find((line) => line.startsWith("*** Update File: "));
  if (!fileLine) {
    throw new Error("Unsupported patch: missing update file header");
  }

  const filePath = fileLine.replace("*** Update File: ", "").trim();
  const oldLines = lines.filter((line) => line.startsWith("-")).map((line) => line.slice(1));
  const newLines = lines.filter((line) => line.startsWith("+")).map((line) => line.slice(1));

  if (oldLines.length === 0 && newLines.length === 0) {
    throw new Error("Unsupported patch: no changes found");
  }

  return {
    filePath,
    oldText: oldLines.join("\n"),
    newText: newLines.join("\n"),
  };
}

export const applyPatchTool: Tool<ApplyPatchArgs> = {
  name: "apply_patch",
  description: "Apply a simple update patch to a workspace file.",
  riskLevel: "high",
  schema: {
    name: "apply_patch",
    description: "Apply a simple update patch to a workspace file.",
    inputSchema: {
      type: "object",
      properties: {
        patch: { type: "string" },
      },
      required: ["patch"],
    },
  },
  async execute(args, context) {
    try {
      const parsed = parsePatch(args.patch);
      const filePath = resolvePathInWorkspace(
        context.workspaceRoot,
        parsed.filePath,
      );
      const before = await readFile(filePath, "utf8");

      if (!before.includes(parsed.oldText)) {
        return {
          success: false,
          output: "",
          error: "patch failed: target content not found",
        };
      }

      const after = before.replace(parsed.oldText, parsed.newText);
      await mkdir(join(context.workspaceRoot, ".agent", "sessions", context.sessionId, "patches"), {
        recursive: true,
      });
      await writeFile(filePath, after, "utf8");
      await writeFile(
        join(
          context.workspaceRoot,
          ".agent",
          "sessions",
          context.sessionId,
          "patches",
          `${Date.now()}.patch`,
        ),
        args.patch,
        "utf8",
      );

      return {
        success: true,
        output: `Patch applied to ${parsed.filePath}`,
        data: { path: parsed.filePath },
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "patch failed",
      };
    }
  },
};
