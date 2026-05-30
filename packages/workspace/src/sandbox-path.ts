import { realpathSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { ValidationError } from "@code-mind/shared";

function normalizeRoot(workspaceRoot: string): string {
  return realpathSync(workspaceRoot);
}

export function resolvePathInWorkspace(
  workspaceRoot: string,
  inputPath: string,
): string {
  const root = normalizeRoot(workspaceRoot);
  const candidate = isAbsolute(inputPath)
    ? resolve(inputPath)
    : resolve(root, inputPath);

  return assertPathInWorkspace(root, candidate);
}

export function assertPathInWorkspace(
  workspaceRoot: string,
  absolutePath: string,
): string {
  const root = normalizeRoot(workspaceRoot);
  const relativePath = relative(root, absolutePath);

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
  ) {
    throw new ValidationError(`Path escapes workspace: ${absolutePath}`);
  }

  return absolutePath;
}

export function isSensitivePath(inputPath: string): boolean {
  return (
    inputPath === ".env" ||
    inputPath.startsWith(".env.") ||
    inputPath.startsWith("secrets/") ||
    inputPath.endsWith(".pem") ||
    inputPath.endsWith(".key")
  );
}
