import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Tool } from "../shared/types.js";
import { resolvePathInWorkspace } from "../workspace/sandbox-path.js";
import { truncateToolOutput } from "./output.js";

interface ApplyPatchArgs {
  patch: string;
}

export interface ParsedPatch {
  filePath: string;
  oldText: string;
  newText: string;
}

export function parsePatch(patch: string): ParsedPatch {
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

export function buildPatchPreview(patch: string): string {
  return truncateToolOutput(patch, { maxChars: 4000 });
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
      const sessionRoot = join(
        context.workspaceRoot,
        ".agent",
        "sessions",
        context.sessionId,
      );
      const patchesDir = join(sessionRoot, "patches");
      const diffsDir = join(sessionRoot, "diffs");
      const diffId = `${Date.now()}`;
      await mkdir(patchesDir, { recursive: true });
      await mkdir(diffsDir, { recursive: true });
      await writeFile(filePath, after, "utf8");
      await writeFile(
        join(patchesDir, `${diffId}.patch`),
        args.patch,
        "utf8",
      );
      const diffPath = join(diffsDir, `${diffId}.diff`);
      await writeFile(diffPath, args.patch, "utf8");

      return {
        success: true,
        output: `Patch applied to ${parsed.filePath}\n${buildPatchPreview(args.patch)}`,
        data: { path: parsed.filePath },
        artifacts: [
          {
            type: "diff",
            path: diffPath,
            description: `Applied diff for ${parsed.filePath}`,
          },
        ],
        metadata: {
          filePath: parsed.filePath,
          diffPath,
          diffPreview: buildPatchPreview(args.patch),
        },
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
