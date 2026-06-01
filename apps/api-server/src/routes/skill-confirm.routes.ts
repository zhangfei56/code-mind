import type { IncomingMessage, ServerResponse } from "node:http";
import { httpSkillConfirmQueue } from "@code-mind/server-runtime";
import { ValidationError } from "@code-mind/shared";
import { readJsonBody, sendJson } from "../http-utils.js";

export async function handleSkillConfirmRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: string,
): Promise<boolean> {
  const listMatch = url.match(/^\/api\/sessions\/([^/]+)\/skill-confirm$/);
  if (listMatch && request.method === "GET") {
    const sessionId = listMatch[1] ?? "";
    sendJson(response, 200, httpSkillConfirmQueue.listPending(sessionId));
    return true;
  }

  const resolveMatch = url.match(/^\/api\/sessions\/([^/]+)\/skill-confirm\/([^/]+)$/);
  if (resolveMatch && request.method === "POST") {
    const sessionId = resolveMatch[1] ?? "";
    const confirmId = resolveMatch[2] ?? "";
    try {
      const body = await readJsonBody<{ confirmed?: boolean }>(request);
      const resolved = httpSkillConfirmQueue.resolveConfirm(confirmId, body.confirmed === true);
      if (!resolved) {
        sendJson(response, 404, { error: "Pending skill confirmation not found." });
        return true;
      }
      if (resolved.sessionId !== sessionId) {
        sendJson(response, 400, {
          error: "Skill confirmation does not belong to this session.",
        });
        return true;
      }
      sendJson(response, 200, resolved);
      return true;
    } catch (error) {
      sendJson(response, error instanceof ValidationError ? 400 : 500, {
        error: error instanceof Error ? error.message : "Skill confirmation failed.",
      });
      return true;
    }
  }

  return false;
}
