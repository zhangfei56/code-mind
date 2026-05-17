import { createServer, type Server } from "node:http";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { FileSessionStore } from "../session/session-store.js";

export function createWebUiServer(workspaceRoot: string): Server {
  const store = new FileSessionStore(workspaceRoot);
  return createServer(async (request, response) => {
    const url = request.url ?? "/";
    if (url === "/api/sessions") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(await store.listSessionManifests(), null, 2));
      return;
    }
    const sessionMatch = url.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(await store.readManifest(sessionMatch[1] ?? ""), null, 2));
      return;
    }
    if (url.startsWith("/api/sessions/") && url.endsWith("/diff")) {
      const sessionId = url.split("/")[3] ?? "";
      const diffsDir = store.getDiffsDir(sessionId);
      if (!existsSync(diffsDir)) {
        response.statusCode = 404;
        response.end("No diff");
        return;
      }
      const files = readdirSync(diffsDir).filter((file) => file.endsWith(".diff")).sort();
      if (files.length === 0) {
        response.statusCode = 404;
        response.end("No diff");
        return;
      }
      response.end(readFileSync(join(diffsDir, files[files.length - 1] ?? ""), "utf8"));
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><body><h1>Code Mind Sessions</h1><div id="app"></div><script>
fetch('/api/sessions').then(r=>r.json()).then(items=>{
 document.getElementById('app').innerHTML = '<ul>' + items.map(item => '<li>' + item.id + ' - ' + item.status + ' - ' + item.task + '</li>').join('') + '</ul>';
});
</script></body></html>`);
  });
}
