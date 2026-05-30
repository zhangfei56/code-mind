#!/usr/bin/env node
/**
 * Local web preview for mock CLI UI output.
 * Usage: pnpm mock:serve
 */
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import {
  approvalScenario,
  explainRepoScenario,
  listMockScenarios,
  shellFailureScenario,
} from "../apps/cli/src/mock/index.js";
import { replayMockScenario } from "../apps/cli/src/mock/replay.js";
import type { DisplayLevel } from "../apps/cli/src/ui/display-level.js";
import type { MockScenario } from "../apps/cli/src/mock/types.js";

const PORT = Number(process.env.MOCK_UI_PORT ?? 8765);

const SCENARIO_MAP: Record<string, MockScenario> = {
  "explain-repo": explainRepoScenario,
  "shell-failure": shellFailureScenario,
  approval: approvalScenario,
};

async function renderPreview(
  scenarioId: string,
  level: DisplayLevel,
): Promise<{ stderr: string; stdout: string }> {
  const base = SCENARIO_MAP[scenarioId] ?? explainRepoScenario;
  const scenario = { ...base, cwd: process.cwd() };
  return replayMockScenario(scenario, level, { isTTY: level <= 1 });
}

function pageHtml(): string {
  const scenarios = listMockScenarios()
    .map((s) => `<option value="${s.id}">${s.id} — ${s.description}</option>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <title>code-mind mock CLI preview</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin: 0; background: #0d1117; color: #c9d1d9; }
    header { padding: 16px 20px; border-bottom: 1px solid #30363d; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    h1 { font-size: 16px; margin: 0; color: #58a6ff; }
    select, button { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 6px 10px; font: inherit; }
    button { cursor: pointer; background: #238636; border-color: #238636; color: #fff; }
    button:hover { background: #2ea043; }
    main { display: grid; grid-template-columns: 1fr 1fr; gap: 0; min-height: calc(100vh - 57px); }
    section { padding: 16px 20px; border-right: 1px solid #30363d; overflow: auto; }
    section:last-child { border-right: none; }
    h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #8b949e; margin: 0 0 12px; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; line-height: 1.5; font-size: 13px; }
    .stderr { color: #8b949e; }
    .stdout { color: #e6edf3; }
    @media (max-width: 900px) { main { grid-template-columns: 1fr; } section { border-right: none; border-bottom: 1px solid #30363d; } }
  </style>
</head>
<body>
  <header>
    <h1>code-mind mock CLI</h1>
    <select id="scenario">${scenarios}</select>
    <select id="level">
      <option value="0">L0 quiet</option>
      <option value="1">L1 REPL</option>
      <option value="2">L2 verbose</option>
      <option value="3">L3 trace</option>
    </select>
    <button id="refresh">Refresh</button>
  </header>
  <main>
    <section><h2>stderr · progress</h2><pre class="stderr" id="stderr">loading…</pre></section>
    <section><h2>stdout · result</h2><pre class="stdout" id="stdout"></pre></section>
  </main>
  <script>
    async function load() {
      const scenario = document.getElementById('scenario').value;
      const level = document.getElementById('level').value;
      const res = await fetch('/api/preview?scenario=' + encodeURIComponent(scenario) + '&level=' + level);
      const data = await res.json();
      document.getElementById('stderr').textContent = data.stderr || '(empty)';
      document.getElementById('stdout').textContent = data.stdout || '(empty)';
    }
    document.getElementById('refresh').addEventListener('click', load);
    document.getElementById('scenario').addEventListener('change', load);
    document.getElementById('level').addEventListener('change', load);
    load();
  </script>
</body>
</html>`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

  if (url.pathname === "/api/preview") {
    const scenario = url.searchParams.get("scenario") ?? "explain-repo";
    const level = Number(url.searchParams.get("level") ?? "0") as DisplayLevel;
    try {
      process.env.NO_COLOR = "1";
      const output = await renderPreview(scenario, level);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(output));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(error) }));
    }
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(pageHtml());
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Mock CLI preview: http://127.0.0.1:${PORT}`);
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.on("SIGINT", () => server.close());
}
