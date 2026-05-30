import type { Tool } from "@code-mind/shared";
import { PLAN_TOOLS_MODES, READ_TOOLS_MODES, WRITE_TOOLS_MODES } from "@code-mind/shared";
import { GitManager } from "../services/git-manager.js";

const git = new GitManager();

export const gitStatusTool: Tool<Record<string, never>, { branch: string }> = {
  name: "git_status",
  description: "Get git working tree status.",
  riskLevel: "low",
  availableInModes: READ_TOOLS_MODES,
  schema: {
    name: "git_status",
    description: "Get git working tree status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  async execute(_args, context) {
    const result = await git.status(context.cwd);
    return {
      success: true,
      output: [
        `branch: ${result.branch}`,
        `clean: ${String(result.clean)}`,
        "",
        `modified: ${result.modified.join(", ") || "-"}`,
        `untracked: ${result.untracked.join(", ") || "-"}`,
        `deleted: ${result.deleted.join(", ") || "-"}`,
      ].join("\n"),
      data: result,
    };
  },
};

export const gitDiffTool: Tool<{ path?: string; staged?: boolean }> = {
  name: "git_diff",
  description: "Get current git diff.",
  riskLevel: "low",
  availableInModes: READ_TOOLS_MODES,
  schema: {
    name: "git_diff",
    description: "Get current git diff.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        staged: { type: "boolean" },
      },
    },
  },
  async execute(args, context) {
    const diff = await git.diff(context.cwd, args.path, args.staged);
    return {
      success: true,
      output: diff,
      data: { diff },
    };
  },
};

export const gitLogTool: Tool<{ limit?: number }> = {
  name: "git_log",
  description: "Get recent git log.",
  riskLevel: "low",
  availableInModes: READ_TOOLS_MODES,
  schema: {
    name: "git_log",
    description: "Get recent git log.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" },
      },
    },
  },
  async execute(args, context) {
    const output = await git.log(context.cwd, args.limit ?? 5);
    return {
      success: true,
      output,
    };
  },
};

export const gitChangedFilesTool: Tool<Record<string, never>> = {
  name: "git_changed_files",
  description: "List modified, deleted, and untracked files.",
  riskLevel: "low",
  availableInModes: PLAN_TOOLS_MODES,
  schema: {
    name: "git_changed_files",
    description: "List modified, deleted, and untracked files.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  async execute(_args, context) {
    const changed = await git.changedFiles(context.cwd);
    return {
      success: true,
      output: JSON.stringify(changed, null, 2),
      data: changed,
    };
  },
};

export const gitShowTool: Tool<{ ref?: string }> = {
  name: "git_show",
  description: "Show git ref summary.",
  riskLevel: "low",
  availableInModes: READ_TOOLS_MODES,
  schema: {
    name: "git_show",
    description: "Show git ref summary.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string" },
      },
    },
  },
  async execute(args, context) {
    const output = await git.show(context.cwd, args.ref ?? "HEAD");
    return {
      success: true,
      output,
    };
  },
};

export const gitRestoreFileTool: Tool<{ path: string }> = {
  name: "git_restore_file",
  description: "Restore a file from git.",
  riskLevel: "high",
  availableInModes: WRITE_TOOLS_MODES,
  schema: {
    name: "git_restore_file",
    description: "Restore a file from git.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
    },
  },
  async execute(args, context) {
    const output = await git.restoreFile(context.cwd, args.path);
    return {
      success: true,
      output,
    };
  },
};
