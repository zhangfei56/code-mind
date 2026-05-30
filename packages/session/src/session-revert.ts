import { rollbackSessionChanges } from "@code-mind/workspace";
import { appendRunEvent, readSessionIndex } from "@code-mind/observability";
import { buildAgentEvent, createId, nowIso } from "@code-mind/shared";
import { FileSessionStore } from "./session-store.js";

export interface RevertSessionResult {
  sessionId: string;
  reverted: string[];
  skipped: boolean;
}

export async function revertSession(
  workspaceRoot: string,
  sessionId: string,
): Promise<RevertSessionResult> {
  const store = new FileSessionStore(workspaceRoot);
  await store.readManifest(sessionId);

  const rollback = await rollbackSessionChanges(workspaceRoot, sessionId);
  if (!rollback.skipped) {
    const index = await readSessionIndex(workspaceRoot, sessionId);
    if (index?.lastRunId) {
      const event = buildAgentEvent(
        {
          runId: index.lastRunId,
          sessionId,
          source: { component: "session.revert", surface: "cli" },
        },
        0,
        {
          kind: "recovery.triggered",
          level: "info",
          payload: { action: "session_revert", reverted: rollback.reverted },
        },
      );
      await appendRunEvent(workspaceRoot, index.lastRunId, {
        ...event,
        id: createId("evt"),
        ts: nowIso(),
      });
    }
  }

  return {
    sessionId,
    reverted: rollback.reverted,
    skipped: rollback.skipped,
  };
}
