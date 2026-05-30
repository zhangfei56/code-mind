import { createServer, type IncomingMessage, type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { createOrchestrationSessionStore, runtimeEventHub } from "@code-mind/core";
import { logProcess } from "@code-mind/shared";
import {
  handleApprovalRoutes,
  handlePlanApprovalRoutes,
  handleRunRoutes,
  handleSessionRoutes,
  renderHomePage,
} from "./routes/index.js";



function attachWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    logProcess("api.server", "debug", "Handling websocket upgrade.", {
      method: request.method ?? "GET",
      url: request.url ?? "/",
    });
    const url = request.url?.split("?")[0] ?? "";
    const runMatch = url.match(/^\/ws\/runs\/([^/]+)$/);
    const sessionMatch = url.match(/^\/ws\/sessions\/([^/]+)$/);
    if (!runMatch && !sessionMatch) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws: WebSocket, request: IncomingMessage) => {
    const url = request.url?.split("?")[0] ?? "";
    const runMatch = url.match(/^\/ws\/runs\/([^/]+)$/);
    const sessionMatch = url.match(/^\/ws\/sessions\/([^/]+)$/);
    const channel = runMatch?.[1] ?? `session:${sessionMatch?.[1] ?? ""}`;
    logProcess("api.server", "debug", "Accepted websocket connection.", { channel, url });
    if (!channel || channel === "session:") {
      ws.close(1008, "Invalid stream channel.");
      return;
    }

    const unsubscribe = runtimeEventHub.subscribe(channel, (event) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(event));
      }
    });
    ws.on("close", unsubscribe);
  });

  return wss;
}

export function createWebUiServer(workspaceRoot: string): Server {
  const store = createOrchestrationSessionStore(workspaceRoot);
  const server = createServer(async (request, response) => {
    logProcess("api.server", "debug", "Received HTTP request.", {
      method: request.method ?? "GET",
      url: request.url ?? "/",
    });
    const url = request.url?.split("?")[0] ?? "/";
    if (await handleRunRoutes(request, response, workspaceRoot, url)) {
      return;
    }
    if (await handleApprovalRoutes(request, response, store, url)) {
      return;
    }
    if (await handlePlanApprovalRoutes(request, response, url)) {
      return;
    }
    if (await handleSessionRoutes(request, response, store, workspaceRoot, url)) {
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(renderHomePage());
  });

  attachWebSocket(server);
  return server;
}

export function startApiServer(
  workspaceRoot: string,
  port: number,
): Promise<Server> {
  const server = createWebUiServer(workspaceRoot);
  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`Code Mind API server listening on http://127.0.0.1:${port}`);
      console.log(`WebSocket streams: ws://127.0.0.1:${port}/ws/runs/:runId`);
      resolve(server);
    });
  });
}
