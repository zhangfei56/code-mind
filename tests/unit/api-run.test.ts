import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWebUiServer } from "@code-mind/api-server";

async function waitForRun(
  port: number,
  runId: string,
  predicate: (job: { status: string }) => boolean,
): Promise<{ status: string; result?: { result: { sessionId: string; status: string } } }> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${port}/api/runs/${runId}`);
    assert.equal(response.status, 200);
    const job = (await response.json()) as {
      status: string;
      result?: { result: { sessionId: string; status: string } };
    };
    if (predicate(job)) {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for run ${runId}.`);
}

function parseSseEvents(raw: string): Array<{ event: string; data: unknown }> {
  return raw
    .trim()
    .split(/\n\n+/)
    .map((block) => {
      const lines = block.split("\n");
      const event = lines.find((line) => line.startsWith("event: "))?.slice("event: ".length) ?? "message";
      const data = lines
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice("data: ".length))
        .join("\n");
      return { event, data: JSON.parse(data) as unknown };
    });
}

export async function runApiRunTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-api-run-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  const originalFetch = globalThis.fetch;

  const server = createWebUiServer(workspace);
  await new Promise<void>((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected server address.");
  }

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith(`http://127.0.0.1:${address.port}`)) {
      return originalFetch(input, init);
    }
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "hello from test model",
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const missingModeResponse = await fetch(`http://127.0.0.1:${address.port}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task: "" }),
    });
    assert.equal(missingModeResponse.status, 400);

    const invalidModeResponse = await fetch(`http://127.0.0.1:${address.port}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task: "hello", mode: "invalid" }),
    });
    assert.equal(invalidModeResponse.status, 400);

    const asyncResponse = await fetch(`http://127.0.0.1:${address.port}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task: "say hello",
        mode: "ask",
        maxSteps: 3,
        model: "local:demo",
      }),
    });
    assert.equal(asyncResponse.status, 202);
    const asyncPayload = (await asyncResponse.json()) as {
      runId: string;
      status: string;
      pollUrl: string;
      abortUrl: string;
    };
    assert.ok(asyncPayload.runId);
    assert.equal(asyncPayload.status, "running");

    const completed = await waitForRun(
      address.port,
      asyncPayload.runId,
      (job) => job.status === "completed" || job.status === "failed",
    );
    assert.equal(completed.status, "completed");
    assert.ok(completed.result?.result.sessionId);

    const syncResponse = await fetch(`http://127.0.0.1:${address.port}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task: "sync hello",
        mode: "ask",
        maxSteps: 3,
        model: "local:demo",
        async: false,
      }),
    });
    assert.equal(syncResponse.status, 200);
    const syncPayload = (await syncResponse.json()) as {
      result: { status: string; sessionId: string };
      task: { mode: string };
    };
    assert.equal(syncPayload.task.mode, "ask");
    assert.ok(syncPayload.result.sessionId);

    const streamResponse = await fetch(`http://127.0.0.1:${address.port}/api/runs/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task: "stream hello",
        mode: "ask",
        maxSteps: 3,
        model: "local:demo",
      }),
    });
    assert.equal(streamResponse.status, 200);
    assert.match(streamResponse.headers.get("content-type") ?? "", /text\/event-stream/);
    assert.ok(streamResponse.headers.get("x-code-mind-run-id"));
    const streamEvents = parseSseEvents(await streamResponse.text());
    assert.ok(streamEvents.some((event) => event.event === "run"));
    assert.ok(
      streamEvents.some(
        (event) =>
          event.event === "agent_event" &&
          typeof event.data === "object" &&
          event.data !== null &&
          (event.data as { kind?: string }).kind === "turn.started",
      ),
    );
    assert.ok(
      streamEvents.some(
        (event) =>
          event.event === "agent_event" &&
          typeof event.data === "object" &&
          event.data !== null &&
          (event.data as { kind?: string }).kind === "turn.finished",
      ),
    );
    assert.ok(streamEvents.some((event) => event.event === "final"));
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
    });
  }
}
