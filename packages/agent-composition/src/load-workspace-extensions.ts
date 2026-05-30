import { loadExtensions, type LoadedExtensions } from "@code-mind/capabilities";

/** Workspace extensions without registering default/MCP tools (CLI metadata commands). */
export async function loadWorkspaceExtensions(
  workspaceRoot: string,
): Promise<LoadedExtensions> {
  return loadExtensions(workspaceRoot);
}
