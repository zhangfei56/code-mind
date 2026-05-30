import type { IncomingMessage, ServerResponse } from "node:http";
import type { SessionStorePort } from "@code-mind/core";
import { revertSession } from "@code-mind/session";
import { DiffManager } from "@code-mind/workspace";
import { sendJson } from "../http-utils.js";

export async function handleSessionRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  store: SessionStorePort,
  workspaceRoot: string,
  url: string,
): Promise<boolean> {
  if (url === "/api/sessions") {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed." });
      return true;
    }
    sendJson(response, 200, await store.listSessionManifests());
    return true;
  }

  const sessionMatch = url.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionMatch) {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed." });
      return true;
    }
    try {
      sendJson(response, 200, await store.readManifest(sessionMatch[1] ?? ""));
    } catch (error) {
      sendJson(response, 404, {
        error: error instanceof Error ? error.message : "Session not found.",
      });
    }
    return true;
  }

  const revertMatch = url.match(/^\/api\/sessions\/([^/]+)\/revert$/);
  if (revertMatch) {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed." });
      return true;
    }
    const sessionId = revertMatch[1] ?? "";
    try {
      const result = await revertSession(workspaceRoot, sessionId);
      sendJson(response, result.skipped ? 404 : 200, result);
    } catch (error) {
      sendJson(response, 404, {
        error: error instanceof Error ? error.message : "Revert failed.",
      });
    }
    return true;
  }

  const diffMatch = url.match(/^\/api\/sessions\/([^/]+)\/diff$/);
  if (diffMatch) {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed." });
      return true;
    }
    const sessionId = diffMatch[1] ?? "";
    const diffManager = new DiffManager(workspaceRoot, sessionId);
    const latestDiff = await diffManager.readLatestDiff();
    if (!latestDiff) {
      sendJson(response, 404, { error: "No diff available for this session." });
      return true;
    }
    response.statusCode = 200;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end(latestDiff);
    return true;
  }

  return false;
}

export function renderHomePage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Code Mind Sessions</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 0; padding: 1.5rem; line-height: 1.5; }
    h1 { margin-top: 0; }
    .layout { display: grid; grid-template-columns: 280px 1fr; gap: 1.5rem; align-items: start; }
    @media (max-width: 800px) { .layout { grid-template-columns: 1fr; } }
    .panel { border: 1px solid #8884; border-radius: 8px; padding: 1rem; }
    .session-item { display: block; width: 100%; text-align: left; margin: 0.25rem 0; padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid transparent; background: transparent; cursor: pointer; }
    .session-item:hover, .session-item.active { border-color: #8886; background: #8881; }
    .badge { display: inline-block; padding: 0.1rem 0.45rem; border-radius: 999px; font-size: 0.8rem; border: 1px solid #8885; }
    .approval { border: 1px solid #8884; border-radius: 8px; padding: 0.75rem; margin: 0.75rem 0; }
    pre { overflow: auto; padding: 0.75rem; border-radius: 6px; background: #8881; font-size: 0.85rem; }
    .actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
    button.primary { background: #2563eb; color: white; border: none; border-radius: 6px; padding: 0.45rem 0.9rem; cursor: pointer; }
    button.danger { background: #dc2626; color: white; border: none; border-radius: 6px; padding: 0.45rem 0.9rem; cursor: pointer; }
    button.secondary { background: transparent; border: 1px solid #8886; border-radius: 6px; padding: 0.45rem 0.9rem; cursor: pointer; }
    .muted { opacity: 0.7; font-size: 0.9rem; }
    .empty { padding: 1rem 0; }
  </style>
</head>
<body>
  <h1>Code Mind Sessions</h1>
  <p class="muted">POST /api/runs · POST /api/runs/stream · GET/POST /api/runs/:id · ws://…/ws/runs/:id · GET/POST /api/sessions/:id/plan-approval</p>
  <div class="layout">
    <section class="panel">
      <h2>Sessions</h2>
      <div id="sessions"><p class="muted">Loading…</p></div>
      <button class="secondary" id="refresh" type="button">Refresh</button>
    </section>
    <section class="panel">
      <h2 id="detail-title">Select a session</h2>
      <div id="detail"><p class="empty muted">Choose a session to view status and pending approvals.</p></div>
    </section>
  </div>
  <script>
    let selectedSessionId = null;
    let pollTimer = null;

    async function fetchJson(url, options) {
      const response = await fetch(url, options);
      const text = await response.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = text; }
      if (!response.ok) {
        const message = body && body.error ? body.error : (typeof body === 'string' ? body : response.statusText);
        throw new Error(message || 'Request failed');
      }
      return body;
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    }

    function renderSessions(items) {
      const root = document.getElementById('sessions');
      if (!items.length) {
        root.innerHTML = '<p class="empty muted">No sessions yet.</p>';
        return;
      }
      root.innerHTML = items.map(item => {
        const active = item.id === selectedSessionId ? ' active' : '';
        const role = item.sessionRole || 'standard';
        const link = item.executeSessionId
          ? ' -> execute:' + escapeHtml(item.executeSessionId)
          : item.planSessionId
            ? ' <- plan:' + escapeHtml(item.planSessionId)
            : '';
        return '<button type="button" class="session-item' + active + '" data-session-id="' + escapeHtml(item.id) + '">' +
          '<strong>' + escapeHtml(item.id) + '</strong><br>' +
          '<span class="badge">' + escapeHtml(item.status || 'unknown') + '</span> ' +
          '<span class="muted">' + escapeHtml(item.mode || '') + ' · ' + escapeHtml(role) + link + '</span>' +
        '</button>';
      }).join('');
      root.querySelectorAll('[data-session-id]').forEach(button => {
        button.addEventListener('click', () => selectSession(button.dataset.sessionId));
      });
    }

    function renderApproval(approval) {
      const preview = approval.metadata && approval.metadata.diffPreview
        ? '<pre>' + escapeHtml(approval.metadata.diffPreview) + '</pre>'
        : (approval.metadata && approval.metadata.arguments
          ? '<pre>' + escapeHtml(JSON.stringify(approval.metadata.arguments, null, 2)) + '</pre>'
          : '');
      return '<article class="approval" data-approval-id="' + escapeHtml(approval.id) + '">' +
        '<div><strong>' + escapeHtml(approval.toolName) + '</strong> · ' + escapeHtml(approval.id) + '</div>' +
        '<p>' + escapeHtml(approval.reason || '') + '</p>' +
        preview +
        '<div class="actions">' +
          '<button type="button" class="primary" data-action="approve" data-approval-id="' + escapeHtml(approval.id) + '">Approve</button>' +
          '<button type="button" class="danger" data-action="deny" data-approval-id="' + escapeHtml(approval.id) + '">Deny</button>' +
        '</div>' +
      '</article>';
    }

    async function renderDetail(sessionId) {
      const detail = document.getElementById('detail');
      const title = document.getElementById('detail-title');
      title.textContent = 'Session ' + sessionId;
      detail.innerHTML = '<p class="muted">Loading…</p>';
      try {
        const [manifest, approvals] = await Promise.all([
          fetchJson('/api/sessions/' + encodeURIComponent(sessionId)),
          fetchJson('/api/sessions/' + encodeURIComponent(sessionId) + '/approvals'),
        ]);
        const pending = Array.isArray(approvals) ? approvals : [];
        const role = manifest.sessionRole || 'standard';
        const links = [
          manifest.executeSessionId ? 'Execute: ' + manifest.executeSessionId : '',
          manifest.planSessionId ? 'Plan: ' + manifest.planSessionId : '',
        ].filter(Boolean).join(' · ');
        detail.innerHTML =
          '<p><span class="badge">' + escapeHtml(manifest.status || 'unknown') + '</span> ' +
          escapeHtml(manifest.mode || '') + ' · ' + escapeHtml(role) + '</p>' +
          (links ? '<p class="muted">' + escapeHtml(links) + '</p>' : '') +
          '<p>' + escapeHtml(manifest.task || '') + '</p>' +
          '<h3>Pending approvals (' + pending.length + ')</h3>' +
          (pending.length
            ? pending.map(renderApproval).join('')
            : '<p class="empty muted">No pending approvals.</p>');
        detail.querySelectorAll('[data-action]').forEach(button => {
          button.addEventListener('click', () => resolveApproval(sessionId, button.dataset.approvalId, button.dataset.action));
        });
      } catch (error) {
        detail.innerHTML = '<p class="danger">' + escapeHtml(error.message) + '</p>';
      }
    }

    async function resolveApproval(sessionId, approvalId, action) {
      try {
        await fetchJson('/api/sessions/' + encodeURIComponent(sessionId) + '/approvals/' + encodeURIComponent(approvalId), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        await refreshAll();
      } catch (error) {
        alert(error.message);
      }
    }

    async function selectSession(sessionId) {
      selectedSessionId = sessionId;
      await refreshAll();
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(refreshAll, 3000);
    }

    async function refreshAll() {
      try {
        const items = await fetchJson('/api/sessions');
        renderSessions(Array.isArray(items) ? items : []);
        if (selectedSessionId) {
          await renderDetail(selectedSessionId);
        }
      } catch (error) {
        document.getElementById('sessions').innerHTML = '<p class="danger">' + escapeHtml(error.message) + '</p>';
      }
    }

    document.getElementById('refresh').addEventListener('click', refreshAll);
    refreshAll();
  </script>
</body>
</html>`;
}
