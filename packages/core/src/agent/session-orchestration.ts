import { WorktreeManager } from "@code-mind/execution";
import type {
  AgentMode,
  AgentProfile,
  AgentResult,
  ModelProvider,
  UserTask,
} from "@code-mind/shared";
import { AgentLoopController } from "./runtime/agent-loop-controller.js";
import { createOrchestrationSessionStore } from "./session-store-factory.js";

export function buildExecuteTask(
  baseTask: UserTask,
  executionMode: AgentMode,
  planText: string,
): UserTask {
  return {
    ...baseTask,
    mode: executionMode,
    text: `${baseTask.text}\n\n## Plan\n\n${planText}\n\nExecute the approved plan above.`,
  };
}

export async function prepareTask(
  task: UserTask,
  workspaceRoot: string,
  useWorktree?: boolean,
): Promise<{ task: UserTask; sessionRoot?: string }> {
  if (!useWorktree) {
    return { task };
  }
  const worktree = await new WorktreeManager().create(workspaceRoot, task.id);
  return {
    task: {
      ...task,
      cwd: worktree.path,
      metadata: {
        ...task.metadata,
        worktree,
      },
    },
    sessionRoot: workspaceRoot,
  };
}

export async function runAgentLoopOnce(
  loop: AgentLoopController,
  input: {
    task: UserTask;
    profile: AgentProfile;
    model: ModelProvider;
    resumeSessionId?: string;
    sessionRoot?: string;
    abortSignal?: AbortSignal;
    onStatusChange?: (
      status: import("@code-mind/shared").SessionStatus,
    ) => void | Promise<void>;
    onEvent?: (event: import("@code-mind/shared").AgentEvent) => void | Promise<void>;
    approvePlan?: import("./plan-approval.js").PlanApprovalHandler;
    autoApprovePlan?: boolean;
  },
): Promise<AgentResult> {
  return loop.run({
    task: input.task,
    profile: input.profile,
    model: input.model,
    ...(input.resumeSessionId === undefined
      ? {}
      : { resumeSessionId: input.resumeSessionId }),
    ...(input.sessionRoot === undefined ? {} : { sessionRoot: input.sessionRoot }),
    ...(input.abortSignal === undefined ? {} : { abortSignal: input.abortSignal }),
    ...(input.onStatusChange === undefined
      ? {}
      : { onStatusChange: input.onStatusChange }),
    ...(input.onEvent === undefined ? {} : { onEvent: input.onEvent }),
    ...(input.approvePlan === undefined ? {} : { approvePlan: input.approvePlan }),
    ...(input.autoApprovePlan === undefined ? {} : { autoApprovePlan: input.autoApprovePlan }),
  });
}

export async function resolveReturnedTask(
  workspaceRoot: string,
  sessionId: string,
  fallback: UserTask,
): Promise<UserTask> {
  const store = createOrchestrationSessionStore(workspaceRoot);
  const manifest = await store.readManifest(sessionId);
  const worktree = await store.readWorktree(sessionId);
  return {
    ...fallback,
    cwd: manifest.executionCwd ?? fallback.cwd,
    ...(worktree === undefined
      ? {}
      : { metadata: { ...fallback.metadata, worktree } }),
  };
}

export async function linkPlanAndExecuteSessions(
  workspaceRoot: string,
  planSessionId: string,
  executeSessionId: string,
): Promise<void> {
  const store = createOrchestrationSessionStore(workspaceRoot);
  await store.updateManifest(planSessionId, {
    sessionRole: "plan",
    executeSessionId,
  });
  await store.updateManifest(executeSessionId, {
    sessionRole: "execute",
    planSessionId,
  });
}
