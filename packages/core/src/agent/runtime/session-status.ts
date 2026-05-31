import type { CompletionKind, RuntimeInput, SessionStatus, SessionUsageSummary } from "@code-mind/shared";
import type { SessionStorePort } from "./ports/session-store-port.js";

export async function setSessionStatus(
  sessionStore: SessionStorePort,
  sessionId: string,
  status: SessionStatus,
  input?: RuntimeInput,
  extraManifestUpdates: Partial<{
    model: string;
    completion: CompletionKind;
    effectiveMaxSteps: number;
    modifiedFiles: string[];
    usageSummary: SessionUsageSummary;
  }> = {},
): Promise<void> {
  await sessionStore.updateManifest(sessionId, { status, ...extraManifestUpdates });
  await input?.onStatusChange?.(status);
}
