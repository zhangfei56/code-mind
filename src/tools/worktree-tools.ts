import type { Tool } from "../shared/types.js";
import { WorktreeManager } from "../engineering/worktree-manager.js";

const worktrees = new WorktreeManager();

export const worktreeCreateTool: Tool<{
  taskId: string;
  branchName?: string;
  baseRef?: string;
}> = {
  name: "worktree_create",
  description: "Create an isolated git worktree for the task.",
  riskLevel: "high",
  schema: {
    name: "worktree_create",
    description: "Create an isolated git worktree for the task.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        branchName: { type: "string" },
        baseRef: { type: "string" },
      },
      required: ["taskId"],
    },
  },
  async execute(args, context) {
    const info = await worktrees.create(
      context.workspaceRoot,
      args.taskId,
      args.branchName,
      args.baseRef,
    );
    return {
      success: true,
      output: JSON.stringify(info, null, 2),
      data: info,
    };
  },
};

export const worktreeStatusTool: Tool<{ path: string }> = {
  name: "worktree_status",
  description: "Check worktree git status.",
  riskLevel: "low",
  schema: {
    name: "worktree_status",
    description: "Check worktree git status.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
    },
  },
  async execute(args) {
    const output = await worktrees.status(args.path);
    return {
      success: true,
      output,
    };
  },
};

export const worktreeDiffTool: Tool<{ path: string }> = {
  name: "worktree_diff",
  description: "Get worktree diff.",
  riskLevel: "low",
  schema: {
    name: "worktree_diff",
    description: "Get worktree diff.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
    },
  },
  async execute(args) {
    const output = await worktrees.diff(args.path);
    return {
      success: true,
      output,
    };
  },
};

export const worktreeCleanupTool: Tool<{ taskId: string }> = {
  name: "worktree_cleanup",
  description: "Remove a worktree created for the task.",
  riskLevel: "high",
  schema: {
    name: "worktree_cleanup",
    description: "Remove a worktree created for the task.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
      },
      required: ["taskId"],
    },
  },
  async execute(args, context) {
    await worktrees.cleanup(context.workspaceRoot, args.taskId);
    return {
      success: true,
      output: `Cleaned worktree for ${args.taskId}`,
    };
  },
};
