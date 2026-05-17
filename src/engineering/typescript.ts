import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveTypeScriptCommand(): string {
  const cwdCompilerPath = join(
    process.cwd(),
    "node_modules",
    "typescript",
    "bin",
    "tsc",
  );
  if (existsSync(cwdCompilerPath)) {
    return `${process.execPath} "${cwdCompilerPath}"`;
  }

  const filePath = fileURLToPath(import.meta.url);
  const repoRoot = join(dirname(filePath), "..", "..");
  const compilerPath = join(repoRoot, "node_modules", "typescript", "bin", "tsc");
  if (existsSync(compilerPath)) {
    return `${process.execPath} "${compilerPath}"`;
  }
  return "npx tsc";
}
