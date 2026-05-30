import { GitManager } from "@code-mind/execution";

/** Reconcile modified files from workspace git status (authoritative source). */
export async function syncModifiedFilesFromWorkspace(
  workspaceRoot: string,
  modifiedFiles: Set<string>,
): Promise<string[]> {
  const git = new GitManager();
  let changed;
  try {
    changed = await git.changedFiles(workspaceRoot);
  } catch {
    return [...modifiedFiles];
  }

  for (const file of [
    ...changed.modified,
    ...changed.untracked,
    ...changed.deleted,
    ...changed.created,
  ]) {
    modifiedFiles.add(file);
  }
  return [...modifiedFiles];
}

export function recordToolModifiedFile(
  modifiedFiles: Set<string>,
  filePath: string | undefined,
): void {
  if (typeof filePath === "string" && filePath.length > 0) {
    modifiedFiles.add(filePath);
  }
}
