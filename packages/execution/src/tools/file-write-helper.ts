import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ToolResult } from "@code-mind/shared";
import {
  captureFileSnapshot,
  DiffManager,
  resolvePathInWorkspace,
} from "@code-mind/workspace";
import { buildPatchPreview } from "./apply-patch.js";

export async function writeWorkspaceFileChange(options: {
  workspaceRoot: string;
  sessionId: string;
  relativePath: string;
  after: string;
  patchContent: string;
  successMessage: string;
}): Promise<ToolResult> {
  const absolutePath = resolvePathInWorkspace(options.workspaceRoot, options.relativePath);

  let before = "";
  try {
    await access(absolutePath);
    before = await readFile(absolutePath, "utf8");
  } catch {
    // New file.
  }

  await captureFileSnapshot(
    options.workspaceRoot,
    options.sessionId,
    options.relativePath,
    before,
  );

  await mkdir(dirname(absolutePath), { recursive: true });

  const diffManager = new DiffManager(options.workspaceRoot, options.sessionId);
  const artifact = await diffManager.recordPatch(options.patchContent, options.relativePath);
  await writeFile(absolutePath, options.after, "utf8");

  return {
    success: true,
    output: `${options.successMessage}\n${buildPatchPreview(options.patchContent)}`,
    data: { path: options.relativePath },
    artifacts: [
      {
        type: "diff",
        path: artifact.diffPath,
        description: `Applied diff for ${options.relativePath}`,
      },
    ],
    metadata: {
      filePath: options.relativePath,
      diffPath: artifact.diffPath,
      diffPreview: buildPatchPreview(options.patchContent),
    },
  };
}
