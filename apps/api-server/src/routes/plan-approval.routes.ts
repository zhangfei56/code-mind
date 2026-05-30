import type { IncomingMessage, ServerResponse } from "node:http";
import { httpPlanApprovalQueue } from "@code-mind/server-runtime";
import { ValidationError } from "@code-mind/shared";
import { readJsonBody, sendJson } from "../http-utils.js";

export async function handlePlanApprovalRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: string,
): Promise<boolean> {
  if (url === "/api/plan-approvals" && request.method === "GET") {
    sendJson(response, 200, httpPlanApprovalQueue.listPending());
    return true;
  }

  const match = url.match(/^\/api\/sessions\/([^/]+)\/plan-approval$/);
  if (!match) {
    return false;
  }

  const planSessionId = match[1] ?? "";

  if (request.method === "GET") {
    const pending = httpPlanApprovalQueue.getPending(planSessionId);
    if (!pending) {
      sendJson(response, 404, { error: "No pending plan approval for this session." });
      return true;
    }
    sendJson(response, 200, pending);
    return true;
  }

  if (request.method === "POST") {
    try {
      const body = await readJsonBody<{ action?: string }>(request);
      if (body.action !== "approve" && body.action !== "deny") {
        throw new ValidationError('Expected body.action to be "approve" or "deny".');
      }
      const resolved = httpPlanApprovalQueue.resolve(
        planSessionId,
        body.action === "approve",
      );
      if (!resolved) {
        sendJson(response, 404, { error: "No pending plan approval for this session." });
        return true;
      }
      sendJson(response, 200, {
        planSessionId,
        approved: body.action === "approve",
      });
      return true;
    } catch (error) {
      sendJson(response, error instanceof ValidationError ? 400 : 500, {
        error: error instanceof Error ? error.message : "Plan approval action failed.",
      });
      return true;
    }
  }

  sendJson(response, 405, { error: "Method not allowed." });
  return true;
}
