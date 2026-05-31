import { FileSessionStore } from "@code-mind/session";
import {
  createSessionStorePort,
  type SessionStorePort,
} from "./runtime/ports/session-store-port.js";

/** L2 orchestration entry (plan-first, session linking) — not used inside step loop. */
export function createOrchestrationSessionStore(workspaceRoot: string): SessionStorePort {
  return createSessionStorePort(new FileSessionStore(workspaceRoot));
}
