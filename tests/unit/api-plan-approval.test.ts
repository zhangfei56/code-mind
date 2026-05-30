import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { createWebUiServer } from "@code-mind/api-server";
import {
  createHttpPlanApprovalHandler,
  httpPlanApprovalQueue,
} from "@code-mind/server-runtime";
import {
  createAgentLoopController,
  runAgentSession,
} from "@code-mind/core";
import type {
  AgentProfile,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "@code-mind/shared";

class PlanThenExecuteProvider implements ModelProvider {
  name = "fake-plan-api";
  calls = 0;

  async chat(_request: ModelRequest): Promise<ModelResponse> {
    this.calls += 1;
    return {
      text: this.calls === 1 ? "Plan: step 1\nstep 2" : "done",
      finishReason: "stop",
      raw: {},
      toolCalls: [],
    };
  }

  getCapabilities(): ModelCapabilities {
    return {
      toolCall: true,
      parallelToolCall: false,
      jsonSchema: true,
      vision: false,
      reasoning: false,
      maxContextTokens: 100000,
      maxOutputTokens: 8000,
      supportsPromptCache: false,
      supportsComputerUse: false,
    };
  }
}

export async function runHttpPlanApprovalQueueTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-plan-queue-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  const loop = createAgentLoopController();
  const profile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "demo",
  };
  const provider = new PlanThenExecuteProvider();

  const sessionPromise = runAgentSession({
    task: {
      id: "task_1",
      text: "fix",
      cwd: workspace,
      mode: "edit",
      maxSteps: 4,
    },
    profile,
    model: provider,
    loop,
    workspaceRoot: workspace,
    planFirst: true,
    approvePlan: createHttpPlanApprovalHandler(),
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
  const pending = httpPlanApprovalQueue.listPending();
  assert.equal(pending.length, 1);
  assert.match(pending[0]!.planText, /Plan:/);

  const approved = httpPlanApprovalQueue.resolve(pending[0]!.planSessionId, true);
  assert.equal(approved, true);

  const session = await sessionPromise;
  assert.ok(session.planResult);
  assert.notEqual(session.planResult.sessionId, session.result.sessionId);
  assert.equal(httpPlanApprovalQueue.listPending().length, 0);
}

export async function runApiPlanApprovalRouteTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-plan-routes-"));
  mkdirSync(join(workspace, "src"), { recursive: true });

  const server = createWebUiServer(workspace);
  await new Promise<void>((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected server address.");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    void httpPlanApprovalQueue.waitForApproval({
      planSessionId: "session_plan_test",
      planText: "1. Change file\n2. Verify",
    });

    const listResponse = await fetch(`${baseUrl}/api/plan-approvals`);
    assert.equal(listResponse.status, 200);
    const listed = (await listResponse.json()) as Array<{ planSessionId: string }>;
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.planSessionId, "session_plan_test");

    const getResponse = await fetch(`${baseUrl}/api/sessions/session_plan_test/plan-approval`);
    assert.equal(getResponse.status, 200);

    const approveResponse = await fetch(
      `${baseUrl}/api/sessions/session_plan_test/plan-approval`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      },
    );
    assert.equal(approveResponse.status, 200);
    const body = (await approveResponse.json()) as { approved: boolean };
    assert.equal(body.approved, true);
    assert.equal(httpPlanApprovalQueue.listPending().length, 0);
  } finally {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
    });
  }
}

export async function runWebSocketStreamTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-api-ws-"));
  mkdirSync(join(workspace, "src"), { recursive: true });

  const server = createWebUiServer(workspace);
  await new Promise<void>((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected server address.");
  }

  try {
    const startResponse = await fetch(`http://127.0.0.1:${address.port}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task: "hello",
        mode: "ask",
        maxSteps: 2,
        model: "local:demo",
      }),
    });
    assert.equal(startResponse.status, 202);
    const { runId, streamUrl } = (await startResponse.json()) as {
      runId: string;
      streamUrl: string;
    };

    const events: Array<{ type: string }> = [];
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const ws = new WebSocket(`ws://127.0.0.1:${address.port}${streamUrl}`);
      const timeout = setTimeout(() => {
        ws.close();
        rejectPromise(new Error("WebSocket timed out before turn_finished."));
      }, 30000);

      ws.on("message", (data) => {
        const event = JSON.parse(String(data)) as { kind: string };
        events.push(event);
        if (event.kind === "turn.finished") {
          clearTimeout(timeout);
          ws.close();
          resolvePromise();
        }
      });
      ws.on("error", rejectPromise);
    });

    assert.ok(events.some((event) => event.kind === "turn.started"));
    assert.ok(events.some((event) => event.kind === "turn.finished"));
  } finally {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
    });
  }
}
