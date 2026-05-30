import type { CompletionKind, RuntimeInput, SessionStatus } from "@code-mind/shared";
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
  }> = {},
): Promise<void> {
  await sessionStore.updateManifest(sessionId, { status, ...extraManifestUpdates });
  await input?.onStatusChange?.(status);
}
