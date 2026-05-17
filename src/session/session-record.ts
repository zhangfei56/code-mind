import type { SessionRecord } from "../shared/types.js";
import { nowIso } from "../shared/time.js";

export function createSessionRecord(
  sessionId: string,
  type: SessionRecord["type"],
  payload: Record<string, unknown>,
): SessionRecord {
  return {
    sessionId,
    type,
    createdAt: nowIso(),
    payload,
  };
}
