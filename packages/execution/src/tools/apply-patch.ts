import { readFile, writeFile } from "node:fs/promises";
import type { Tool } from "@code-mind/shared";
import { WRITE_TOOLS_MODES } from "@code-mind/shared";
import {
  APPLY_PATCH_FORMAT_EXAMPLE,
  getApplyPatchSchemaDescription,
  parsePatch,
} from "@code-mind/shared";
import {
  captureFileSnapshot,
  DiffManager,
  resolvePathInWorkspace,
} from "@code-mind/workspace";
import { truncateToolOutput } from "./output.js";

interface ApplyPatchArgs {
  patch: string;
}

export { parsePatch, type ParsedPatch } from "@code-mind/shared";

export function buildPatchPreview(patch: string): string {
  return truncateToolOutput(patch, { maxChars: 4000 });
}

const applyPatchSchemaDescription = getApplyPatchSchemaDescription();

export const applyPatchTool: Tool<ApplyPatchArgs> = {
  name: "apply_patch",
  description: applyPatchSchemaDescription,
  riskLevel: "high",
  availableInModes: WRITE_TOOLS_MODES,
  schema: {
    name: "apply_patch",
    description: applyPatchSchemaDescription,
    inputSchema: {
      type: "object",
      properties: {
        patch: {
          type: "string",
          description: `Patch body. Must include \`*** Update File: <relative-path>\` and -/+ change lines.\nExample:\n${APPLY_PATCH_FORMAT_EXAMPLE}`,
        },
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

      await captureFileSnapshot(
        context.workspaceRoot,
        context.sessionId,
        parsed.filePath,
        before,
      );

      const after = before.replace(parsed.oldText, parsed.newText);
      const diffManager = new DiffManager(context.workspaceRoot, context.sessionId);
      const artifact = await diffManager.recordPatch(args.patch, parsed.filePath);
      await writeFile(filePath, after, "utf8");

      return {
        success: true,
        output: `Patch applied to ${parsed.filePath}\n${buildPatchPreview(args.patch)}`,
        data: { path: parsed.filePath },
        artifacts: [
          {
            type: "diff",
            path: artifact.diffPath,
            description: `Applied diff for ${parsed.filePath}`,
          },
        ],
        metadata: {
          filePath: parsed.filePath,
          diffPath: artifact.diffPath,
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
