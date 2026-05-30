import { createId } from "@code-mind/shared";
import type { EventSurface } from "./event.js";
import { EventBus } from "./event-bus.js";
import { RunStore } from "./run-store.js";
import { appendRunToSessionIndex } from "./session-index.js";

export interface CreateRunContextInput {
  workspaceRoot: string;
  sessionId: string;
  parentRunId?: string;
  task: string;
  mode: string;
  cwd: string;
  model: string;
  surface?: EventSurface;
  rawLogging?: boolean;
}

export interface RunContext {
  runId: string;
  sessionId: string;
  eventBus: EventBus;
  runStore: RunStore;
}

export async function createRunContext(input: CreateRunContextInput): Promise<RunContext> {
  const runId = createId("run");
  const runStore = await RunStore.create(input.workspaceRoot, {
    runId,
    sessionId: input.sessionId,
    ...(input.parentRunId === undefined ? {} : { parentRunId: input.parentRunId }),
    task: input.task,
    mode: input.mode,
    cwd: input.cwd,
    model: input.model,
    startedAt: new Date().toISOString(),
    ...(input.rawLogging ? { rawLogging: true } : {}),
  });

  await appendRunToSessionIndex(
    input.workspaceRoot,
    input.sessionId,
    runId,
    input.workspaceRoot,
  );

  const surface = input.surface ?? "cli";
  const eventBus = new EventBus(
    {
      runId,
      sessionId: input.sessionId,
      source: { component: "agent.loop", surface },
    },
    runStore,
    input.rawLogging === true ? { redaction: { rawLogging: true } } : {},
  );

  await eventBus.emit({
    kind: "run.started",
    level: "info",
    payload: {
      task: input.task,
      mode: input.mode,
      cwd: input.cwd,
      model: input.model,
      ...(input.parentRunId === undefined ? {} : { parentRunId: input.parentRunId }),
    },
  });

  return { runId, sessionId: input.sessionId, eventBus, runStore };
}
