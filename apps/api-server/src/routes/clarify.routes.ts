import type { IncomingMessage, ServerResponse } from "node:http";
import { httpClarifyQueue } from "@code-mind/server-runtime";
import { ValidationError } from "@code-mind/shared";
import { readJsonBody, sendJson } from "../http-utils.js";

export async function handleClarifyRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: string,
): Promise<boolean> {
  const listMatch = url.match(/^\/api\/sessions\/([^/]+)\/clarify$/);
  if (listMatch && request.method === "GET") {
    const sessionId = listMatch[1] ?? "";
    sendJson(response, 200, httpClarifyQueue.listPending(sessionId));
    return true;
  }

  const resolveMatch = url.match(/^\/api\/sessions\/([^/]+)\/clarify\/([^/]+)$/);
  if (resolveMatch && request.method === "POST") {
    const sessionId = resolveMatch[1] ?? "";
    const clarifyId = resolveMatch[2] ?? "";
    try {
      const body = await readJsonBody<{ answer?: string; skip?: boolean }>(request);
      const resolved = httpClarifyQueue.resolveClarify(
        clarifyId,
        typeof body.answer === "string" ? body.answer : "",
        body.skip === true,
      );
      if (!resolved) {
        sendJson(response, 404, { error: "Pending clarify request not found." });
        return true;
      }
      if (resolved.sessionId !== sessionId) {
        sendJson(response, 400, { error: "Clarify request does not belong to this session." });
        return true;
      }
      sendJson(response, 200, resolved);
      return true;
    } catch (error) {
      sendJson(response, error instanceof ValidationError ? 400 : 500, {
        error: error instanceof Error ? error.message : "Clarify action failed.",
      });
      return true;
    }
  }

  return false;
}
