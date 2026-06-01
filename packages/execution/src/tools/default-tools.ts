import type { ToolRegistry } from "./registry.js";
import { applyPatchTool } from "./apply-patch.js";
import { deleteFileTool } from "./delete-file.js";
import { globTool } from "./glob.js";
import { grepTool } from "./grep.js";
import { moveFileTool } from "./move-file.js";
import { searchReplaceTool } from "./search-replace.js";
import { writeFileTool } from "./write-file.js";
import {
  gitChangedFilesTool,
  gitDiffTool,
  gitLogTool,
  gitRestoreFileTool,
  gitShowTool,
  gitStatusTool,
} from "./git-tools.js";
import { listDirTool } from "./list-dir.js";
import { lspDiagnosticsTool, lspDefinitionTool, lspReferencesTool, lspSymbolsTool } from "./lsp-tools.js";
import { readFileTool } from "./read-file.js";
import { readSkillTool } from "./read-skill.js";
import { runShellTool } from "./run-shell.js";
import {
  worktreeCleanupTool,
  worktreeCreateTool,
  worktreeDiffTool,
  worktreeStatusTool,
} from "./worktree-tools.js";

export function registerDefaultTools(registry: ToolRegistry): void {
  registry.register(listDirTool);
  registry.register(readFileTool);
  registry.register(readSkillTool);
  registry.register(globTool);
  registry.register(grepTool);
  registry.register(gitStatusTool);
  registry.register(gitDiffTool);
  registry.register(gitLogTool);
  registry.register(gitChangedFilesTool);
  registry.register(gitShowTool);
  registry.register(gitRestoreFileTool);
  registry.register(lspDiagnosticsTool);
  registry.register(lspSymbolsTool);
  registry.register(lspDefinitionTool);
  registry.register(lspReferencesTool);
  registry.register(worktreeCreateTool);
  registry.register(worktreeStatusTool);
  registry.register(worktreeDiffTool);
  registry.register(worktreeCleanupTool);
  registry.register(applyPatchTool);
  registry.register(writeFileTool);
  registry.register(searchReplaceTool);
  registry.register(deleteFileTool);
  registry.register(moveFileTool);
  registry.register(runShellTool);
}
