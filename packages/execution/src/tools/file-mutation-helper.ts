import { access, mkdir, readFile, rename, stat, unlink } from "node:fs/promises";
import { dirname, relative } from "node:path";
import type { ToolResult } from "@code-mind/shared";
import {
  captureFileSnapshot,
  DiffManager,
  resolvePathInWorkspace,
} from "@code-mind/workspace";
import { buildPatchPreview } from "./apply-patch.js";

function toRelativePath(workspaceRoot: string, absolutePath: string): string {
  return relative(workspaceRoot, absolutePath).replace(/\\/g, "/");
}

async function assertRegularFile(absolutePath: string, label: string): Promise<string> {
  const info = await stat(absolutePath);
  if (!info.isFile()) {
    throw new Error(`${label} is not a regular file.`);
  }
  return readFile(absolutePath, "utf8");
}

async function recordMutation(options: {
  workspaceRoot: string;
  sessionId: string;
  relativePath: string;
  patchContent: string;
  successMessage: string;
  data?: Record<string, unknown>;
}): Promise<ToolResult> {
  const diffManager = new DiffManager(options.workspaceRoot, options.sessionId);
  const artifact = await diffManager.recordPatch(options.patchContent, options.relativePath);
  return {
    success: true,
    output: `${options.successMessage}\n${buildPatchPreview(options.patchContent)}`,
    data: { path: options.relativePath, ...(options.data ?? {}) },
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

export async function deleteWorkspaceFile(options: {
  workspaceRoot: string;
  sessionId: string;
  relativePath: string;
}): Promise<ToolResult> {
  const absolutePath = resolvePathInWorkspace(options.workspaceRoot, options.relativePath);
  const before = await assertRegularFile(absolutePath, `Path "${options.relativePath}"`);

  await captureFileSnapshot(
    options.workspaceRoot,
    options.sessionId,
    options.relativePath,
    before,
  );

  const patchContent = `*** Begin Patch
*** Update File: ${options.relativePath}
@@
-${before.replace(/\n/g, "\n-")}
*** End Patch`;

  await unlink(absolutePath);

  return recordMutation({
    workspaceRoot: options.workspaceRoot,
    sessionId: options.sessionId,
    relativePath: options.relativePath,
    patchContent,
    successMessage: `Deleted ${options.relativePath}`,
  });
}

export async function moveWorkspaceFile(options: {
  workspaceRoot: string;
  sessionId: string;
  fromPath: string;
  toPath: string;
}): Promise<ToolResult> {
  const fromAbsolute = resolvePathInWorkspace(options.workspaceRoot, options.fromPath);
  const toAbsolute = resolvePathInWorkspace(options.workspaceRoot, options.toPath);
  const content = await assertRegularFile(fromAbsolute, `Source path "${options.fromPath}"`);

  let destinationBefore = "";
  try {
    await access(toAbsolute);
    destinationBefore = await assertRegularFile(toAbsolute, `Destination path "${options.toPath}"`);
    await captureFileSnapshot(
      options.workspaceRoot,
      options.sessionId,
      options.toPath,
      destinationBefore,
    );
  } catch {
    // Destination does not exist yet.
  }

  await captureFileSnapshot(
    options.workspaceRoot,
    options.sessionId,
    options.fromPath,
    content,
  );

  await mkdir(dirname(toAbsolute), { recursive: true });
  await rename(fromAbsolute, toAbsolute);

  const patchContent = `*** Begin Patch
*** Update File: ${options.toPath}
@@
+${content.replace(/\n/g, "\n+")}
*** End Patch`;

  return recordMutation({
    workspaceRoot: options.workspaceRoot,
    sessionId: options.sessionId,
    relativePath: options.toPath,
    patchContent,
    successMessage: `Moved ${options.fromPath} → ${options.toPath}`,
    data: {
      from: options.fromPath,
      to: options.toPath,
      previousPath: toRelativePath(options.workspaceRoot, fromAbsolute),
    },
  });
}
