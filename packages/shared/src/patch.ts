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
