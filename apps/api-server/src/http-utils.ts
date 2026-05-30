import type { IncomingMessage, ServerResponse } from "node:http";
import { ValidationError, logProcess } from "@code-mind/shared";



export async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    throw new ValidationError("Expected JSON request body.");
  }
  logProcess("api.http", "debug", "Parsed HTTP JSON request body.", {
    method: request.method ?? "GET",
    url: request.url ?? "/",
    body: raw,
  });
  return JSON.parse(raw) as T;
}

export function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  logProcess("api.http", "debug", "Sending HTTP JSON response.", {
    method: response.req?.method ?? "GET",
    url: response.req?.url ?? "/",
    statusCode,
    payload,
  });
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(payload, null, 2));
}
