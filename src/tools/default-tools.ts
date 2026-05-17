import type { ToolRegistry } from "./registry.js";
import { applyPatchTool } from "./apply-patch.js";
import { grepTool } from "./grep.js";
import { listDirTool } from "./list-dir.js";
import { readFileTool } from "./read-file.js";
import { runShellTool } from "./run-shell.js";

export function registerDefaultTools(registry: ToolRegistry): void {
  registry.register(listDirTool);
  registry.register(readFileTool);
  registry.register(grepTool);
  registry.register(applyPatchTool);
  registry.register(runShellTool);
}
