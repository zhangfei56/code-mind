import type { AgentSession, RuntimeInput, WorktreeInfo } from "@code-mind/shared";
import { createId, nowIso } from "@code-mind/shared";
import type { SessionStorePort } from "./ports/session-store-port.js";
import { buildCurrentSummary } from "@code-mind/session";
import { createLoopPolicy } from "../task-strategy.js";
import type { RunState } from "./run-state.js";
import { getEffectiveMaxSteps } from "./run-state.js";
import { runHooks, type SessionLifecycleDeps } from "./session-lifecycle.js";
import { messageUserEvent, turnStartedEvent } from "./agent-events.js";

export interface SessionInitDeps {
  lifecycle: SessionLifecycleDeps;
  setSessionStatus: (
    sessionStore: SessionStorePort,
    sessionId: string,
    status: import("@code-mind/shared").SessionStatus,
    input?: RuntimeInput,
  ) => Promise<void>;
  publish: (
    input: RuntimeInput | undefined,
    event: import("@code-mind/shared").AgentEventInput,
  ) => Promise<void>;
}

export async function initializeSession(
  deps: SessionInitDeps,
  sessionStore: SessionStorePort,
  session: AgentSession,
  input: RuntimeInput,
  runState: RunState,
): Promise<void> {
  await deps.setSessionStatus(sessionStore, session.id, "running", input);
  await runHooks(
    deps.lifecycle,
    "SessionStart",
    sessionStore,
    session,
    {
      event: "SessionStart",
      sessionId: session.id,
      projectPath: session.workspaceRoot,
      mode: session.task.mode,
    },
    input,
  );
  session.task = input.resumeSessionId
    ? { ...session.task, ...input.task, cwd: session.task.cwd }
    : { ...session.task, ...input.task };
  session.profile = input.profile;
  session.modelName = input.model.name;
  session.metadata = { ...session.metadata };
  if (session.task.metadata?.subagent === true) {
    session.metadata.subagent = true;
    if (typeof session.task.metadata.subagentName === "string") {
      session.metadata.subagentName = session.task.metadata.subagentName;
    }
    if (typeof session.task.metadata.subagentRole === "string") {
      session.metadata.subagentRole = session.task.metadata.subagentRole;
    }
    if (typeof session.task.metadata.parentSessionId === "string") {
      session.metadata.parentSessionId = session.task.metadata.parentSessionId;
    }
  }
  await sessionStore.updateManifest(session.id, {
    model: input.model.name,
    executionCwd: session.task.cwd,
  });

  const policy = createLoopPolicy(session.task);
  runState.progress.mode = policy.mode;
  session.metadata.mode = policy.mode;

  await deps.publish(
    input,
    turnStartedEvent({
      modelName: input.model.name,
      maxSteps: getEffectiveMaxSteps(runState),
      requestedMaxSteps: runState.budget.requestedMaxSteps,
      baseMaxSteps: runState.budget.baseMaxSteps,
      mode: policy.mode,
    }),
  );

  if (input.resumeSessionId || !session.messages.some((m) => m.role === "user")) {
    const userMessage = {
      id: createId("msg"),
      role: "user" as const,
      content: input.task.text,
      createdAt: nowIso(),
    };
    session.messages.push(userMessage);
    await deps.publish(input, messageUserEvent(userMessage.content));
  }
  await sessionStore.saveCurrentSummary(
    session.id,
    buildCurrentSummary(session, input.model.name),
  );

  const worktree = input.task.metadata?.worktree as WorktreeInfo | undefined;
  if (worktree) {
    await sessionStore.saveWorktree(session.id, worktree);
  }
}
