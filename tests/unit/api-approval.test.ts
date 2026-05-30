import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWebUiServer } from "@code-mind/api-server";
import { httpApprovalQueue } from "@code-mind/server-runtime";
import { createTestSessionStore } from "./helpers/session-store.js";

export async function runApiApprovalTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-api-approval-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  const store = createTestSessionStore(workspace);
  const session = await store.create(
    {
      id: "task_1",
      text: "demo",
      cwd: workspace,
      mode: "edit",
      maxSteps: 4,
    },
    { id: "default", name: "Default", systemPrompt: "demo" },
  );

  const prompter = httpApprovalQueue.createPrompter(
    (root) => createTestSessionStore(root),
    workspace,
  );
  const approvalDecisionPromise = prompter.approve(
    session.id,
    {
      id: "call_1",
      name: "apply_patch",
      arguments: { patch: "*** Begin Patch\n*** End Patch" },
    },
    { type: "ask", reason: "Patch requires approval." },
  );
  let pending = await store.getPendingApprovals(session.id);
  for (let attempt = 0; attempt < 50 && pending.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    pending = await store.getPendingApprovals(session.id);
  }
  assert.equal(pending.length, 1);

  const server = createWebUiServer(workspace);
  await new Promise<void>((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected server address.");
  }

  try {
    const listResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/sessions/${session.id}/approvals`,
    );
    assert.equal(listResponse.status, 200);
    const listed = (await listResponse.json()) as Array<{ id: string }>;
    assert.equal(listed.length, 1);

    const approveResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/sessions/${session.id}/approvals/${listed[0]!.id}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      },
    );
    assert.equal(approveResponse.status, 200);
    const resolved = await approvalDecisionPromise;
    assert.equal(resolved.approved, true);
  } finally {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
    });
  }
}
