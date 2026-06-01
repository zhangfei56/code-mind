import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfigForModel } from "@code-mind/config";
import { createModelProvider, createDefaultAgentProfile } from "@code-mind/models";
import {
  asyncRunManager,
  createHttpPlanApprovalHandler,
  httpApprovalQueue,
  httpClarifyQueue,
  httpSkillConfirmQueue,
} from "@code-mind/server-runtime";
import { composeAgentLoop, buildCompactionRuntimeOverrides } from "@code-mind/agent-composition";
import {
  createOrchestrationSessionStore,
  createRunEventPublisher,
  applyRecommendedMaxSteps,
  runAgentSession,
  type RunAgentSessionResult,
} from "@code-mind/core";
import {
  AGENT_MODES,
  DEFAULT_MAX_STEPS,
  createId,
  logProcess,
  nowIso,
  ValidationError,
  type AgentEvent,
  type AgentMode,
  type UserTask,
} from "@code-mind/shared";
import { resolveWorkspace } from "@code-mind/workspace";
import { readJsonBody, sendJson } from "../http-utils.js";

interface RunRequestBody {
  task: string;
  mode?: AgentMode;
  maxSteps?: number;
  model?: string;
  cwd?: string;
  planFirst?: boolean;
  useWorktree?: boolean;
  resumeSessionId?: string;
  async?: boolean;
}



function isAgentMode(value: string): value is AgentMode {
  return (AGENT_MODES as readonly string[]).includes(value);
}

async function executeRun(
  workspaceRoot: string,
  body: RunRequestBody,
  options: {
    abortSignal?: AbortSignal;
    runId?: string;
    onEvent?: (event: AgentEvent) => void | Promise<void>;
  } = {},
): Promise<RunAgentSessionResult> {
  logProcess("api.run-routes", "debug", "Executing API run request.", {
    workspaceRoot,
    mode: body.mode ?? "agent",
    maxSteps: body.maxSteps ?? DEFAULT_MAX_STEPS,
    model: body.model,
    cwd: body.cwd,
    planFirst: body.planFirst === true,
    useWorktree: body.useWorktree === true,
    resumeSessionId: body.resumeSessionId,
    asyncRunId: options.runId,
  });
  const mode = body.mode ?? "agent";
  if (!isAgentMode(mode)) {
    throw new ValidationError(`Invalid mode: ${mode}. Expected one of: ${AGENT_MODES.join(", ")}`);
  }

  const cwd = resolveWorkspace(resolve(body.cwd ?? workspaceRoot));
  const task = applyRecommendedMaxSteps(
    {
      id: createId("task"),
      text: body.task.trim(),
      cwd,
      mode,
      maxSteps: body.maxSteps ?? DEFAULT_MAX_STEPS,
      metadata: { createdAt: nowIso() },
    },
    cwd,
  );

  const config = loadConfigForModel(body.model);
  const provider = createModelProvider(config, body.model);
  const resolvedModel = body.model ?? config.defaultModel;
  const modelConfig = config.models[resolvedModel];
  const profile = createDefaultAgentProfile(resolvedModel, {
    ...(modelConfig?.model ? { providerModel: modelConfig.model } : {}),
  });

  const { loop } = await composeAgentLoop(cwd, {
    model: provider,
    profile,
    runtime: buildCompactionRuntimeOverrides(resolvedModel, config),
    permissionPrompter: httpApprovalQueue.createPrompter(
      (root) => createOrchestrationSessionStore(root),
      cwd,
      { ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }) },
    ),
    clarifyPrompter: httpClarifyQueue.createPrompter({
      ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
    }),
    skillConfirmPrompter: httpSkillConfirmQueue.createPrompter({
      ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
    }),
  });

  const publishEvent = createRunEventPublisher(options.runId);
  const onEvent = async (event: AgentEvent): Promise<void> => {
    await publishEvent(event);
    await options.onEvent?.(event);
  };

  return runAgentSession({
    task,
    profile,
    model: provider,
    loop,
    workspaceRoot: cwd,
    ...(body.planFirst === undefined ? {} : { planFirst: body.planFirst }),
    ...(body.planFirst === true
      ? {
          approvePlan: createHttpPlanApprovalHandler({
            ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
          }),
        }
      : {}),
    ...(body.useWorktree === undefined ? {} : { useWorktree: body.useWorktree }),
    ...(body.resumeSessionId === undefined
      ? {}
      : { resumeSessionId: body.resumeSessionId }),
    ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
    onEvent,
  });
}

function writeSse(response: ServerResponse, event: string, payload: unknown): void {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function startSse(response: ServerResponse, runId: string): void {
  response.statusCode = 200;
  response.setHeader("content-type", "text/event-stream; charset=utf-8");
  response.setHeader("cache-control", "no-cache, no-transform");
  response.setHeader("connection", "keep-alive");
  response.setHeader("x-code-mind-run-id", runId);
  response.flushHeaders?.();
}

function validateRunBody(body: RunRequestBody): void {
  if (!body.task?.trim()) {
    throw new ValidationError("Missing task.");
  }

  const mode = body.mode ?? "agent";
  if (!isAgentMode(mode)) {
    throw new ValidationError(`Invalid mode: ${mode}. Expected one of: ${AGENT_MODES.join(", ")}`);
  }
}

export async function handleRunRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  workspaceRoot: string,
  url: string,
): Promise<boolean> {
  const abortMatch = url.match(/^\/api\/runs\/([^/]+)\/abort$/);
  if (abortMatch && request.method === "POST") {
    const runId = abortMatch[1] ?? "";
    const job = await asyncRunManager.abort(runId);
    if (!job) {
      sendJson(response, 404, { error: `Run not found: ${runId}` });
      return true;
    }
    sendJson(response, 200, job);
    return true;
  }

  const getMatch = url.match(/^\/api\/runs\/([^/]+)$/);
  if (getMatch && request.method === "GET") {
    const runId = getMatch[1] ?? "";
    const job = await asyncRunManager.get(runId);
    if (!job) {
      sendJson(response, 404, { error: `Run not found: ${runId}` });
      return true;
    }
    sendJson(response, 200, job);
    return true;
  }

  if (url === "/api/runs/stream" && request.method === "POST") {
    const abortController = new AbortController();
    let completed = false;
    request.on("close", () => {
      if (!completed && !response.writableEnded) {
        abortController.abort(new Error("API stream client disconnected."));
      }
    });

    try {
      const body = await readJsonBody<RunRequestBody>(request);
      logProcess("api.run-routes", "debug", "Received /api/runs/stream request body.", body);
      validateRunBody(body);

      const runId = createId("run");
      startSse(response, runId);
      writeSse(response, "run", {
        runId,
        status: "running",
      });

      const session = await executeRun(workspaceRoot, body, {
        runId,
        abortSignal: abortController.signal,
        onEvent: (event) => writeSse(response, "agent_event", event),
      });
      completed = true;
      writeSse(response, "final", session);
      response.end();
      return true;
    } catch (error) {
      completed = true;
      logProcess("api.run-routes", "debug", "Failed /api/runs/stream request.", { error });
      if (!response.headersSent) {
        sendJson(response, error instanceof ValidationError ? 400 : 500, {
          error: error instanceof Error ? error.message : "Run failed.",
        });
        return true;
      }
      writeSse(response, "error", {
        error: error instanceof Error ? error.message : "Run failed.",
      });
      response.end();
      return true;
    }
  }

  if (url !== "/api/runs" || request.method !== "POST") {
    return false;
  }

  try {
    const body = await readJsonBody<RunRequestBody>(request);
    logProcess("api.run-routes", "debug", "Received /api/runs request body.", body);
    validateRunBody(body);

    const runAsync = body.async !== false;
    if (runAsync) {
      const job = asyncRunManager.start(({ runId, abortSignal }) =>
        executeRun(workspaceRoot, body, { runId, abortSignal }),
      );
      sendJson(response, 202, {
        runId: job.id,
        status: job.status,
        pollUrl: `/api/runs/${job.id}`,
        abortUrl: `/api/runs/${job.id}/abort`,
        streamUrl: `/ws/runs/${job.id}`,
      });
      return true;
    }

    const session = await executeRun(workspaceRoot, body);
    logProcess("api.run-routes", "debug", "Completed synchronous /api/runs request.", {
      sessionId: session.result.sessionId,
      status: session.result.status,
    });
    sendJson(response, 200, session);
    return true;
  } catch (error) {
    logProcess("api.run-routes", "debug", "Failed /api/runs request.", { error });
    sendJson(response, error instanceof ValidationError ? 400 : 500, {
      error: error instanceof Error ? error.message : "Run failed.",
    });
    return true;
  }
}
