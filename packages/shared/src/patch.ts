/** Canonical apply_patch body format (single source for tool schema hints). */
export const APPLY_PATCH_FORMAT_EXAMPLE = `*** Begin Patch
*** Update File: path/to/file
@@
-old line
+new line
*** End Patch`;

/** Tool schema description for apply_patch (exported so tests can assert one source). */
export function getApplyPatchSchemaDescription(): string {
  return [
    "Apply a targeted text replacement to one workspace file.",
    "Prefer over write_file for small edits; use search_replace when replacing one unique old_string.",
    "The - block must match file content exactly once or the patch fails.",
    "Required format:",
    APPLY_PATCH_FORMAT_EXAMPLE,
  ].join("\n");
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
