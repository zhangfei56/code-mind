import { appendRunToSessionIndex, RunStore } from "@code-mind/observability";
import type { AgentEventInput } from "@code-mind/shared";
import { buildAgentEvent, createId } from "@code-mind/shared";

/** Persist a synthetic run transcript for {@code restoreSession} / resume fixtures. */
export async function seedSessionTranscript(
  workspaceRoot: string,
  sessionId: string,
  eventInputs: AgentEventInput[],
): Promise<void> {
  const runId = createId("run");
  const runStore = await RunStore.create(workspaceRoot, {
    runId,
    sessionId,
    task: "fixture",
    mode: "fixture",
    cwd: workspaceRoot,
    model: "fixture",
    startedAt: new Date().toISOString(),
  });
  const ctx = {
    runId,
    sessionId,
    source: { component: "test.fixture", surface: "cli" as const },
  };
  let seq = 0;
  for (const ev of eventInputs) {
    await runStore.appendEvent(buildAgentEvent(ctx, ++seq, ev));
  }
  await runStore.flush();
  await appendRunToSessionIndex(workspaceRoot, sessionId, runId, workspaceRoot);
}
