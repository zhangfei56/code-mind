import type { IncomingMessage, ServerResponse } from "node:http";
import { httpApprovalQueue } from "@code-mind/server-runtime";
import type { SessionStorePort } from "@code-mind/core";
import { ValidationError } from "@code-mind/shared";
import { readJsonBody, sendJson } from "../http-utils.js";

export async function handleApprovalRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  store: SessionStorePort,
  url: string,
): Promise<boolean> {
  const listMatch = url.match(/^\/api\/sessions\/([^/]+)\/approvals$/);
  if (listMatch && request.method === "GET") {
    const sessionId = listMatch[1] ?? "";
    sendJson(response, 200, await store.getPendingApprovals(sessionId));
    return true;
  }

  const resolveMatch = url.match(/^\/api\/sessions\/([^/]+)\/approvals\/([^/]+)$/);
  if (resolveMatch && request.method === "POST") {
    const sessionId = resolveMatch[1] ?? "";
    const approvalId = resolveMatch[2] ?? "";
    try {
      const body = await readJsonBody<{ action?: string }>(request);
      if (body.action !== "approve" && body.action !== "deny") {
        throw new ValidationError('Expected body.action to be "approve" or "deny".');
      }
      const resolved = httpApprovalQueue.resolveApproval(
        store,
        approvalId,
        body.action === "approve",
      );
      if (!resolved) {
        sendJson(response, 404, { error: "Pending approval not found." });
        return true;
      }
      if (resolved.sessionId !== sessionId) {
        sendJson(response, 400, { error: "Approval does not belong to this session." });
        return true;
      }
      sendJson(response, 200, resolved);
      return true;
    } catch (error) {
      sendJson(response, error instanceof ValidationError ? 400 : 500, {
        error: error instanceof Error ? error.message : "Approval action failed.",
      });
      return true;
    }
  }

  return false;
}
