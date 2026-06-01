import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDocumentSymbols } from "@code-mind/execution";
import { resolveBaselinePath } from "../../apps/cli/src/benchmarks/eval-report.js";
import { httpClarifyQueue } from "@code-mind/server-runtime";

export async function runLspToolsTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-lsp-"));
  mkdirSync(join(workspace, "src"), { recursive: true });
  writeFileSync(
    join(workspace, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext" } }, null, 2),
    "utf8",
  );
  writeFileSync(
    join(workspace, "src", "math.ts"),
    "export function add(a: number, b: number): number {\n  return a + b;\n}\n",
    "utf8",
  );

  const symbols = getDocumentSymbols(workspace, "src/math.ts");
  assert.ok(symbols);
  assert.ok(symbols.some((symbol) => symbol.name === "add"));

  const baseline = resolveBaselinePath({
    root: workspace,
    workloadSlug: "t1-polyglot",
    modelName: "deepseek",
    comparePath: "auto",
  });
  assert.match(baseline ?? "", /t1-polyglot-deepseek\.json$/);

  const prompter = httpClarifyQueue.createPrompter();
  const pending = prompter.clarify({
    sessionId: "session_test",
    clarifyId: "clarify_test",
    taskText: "fix test",
    question: "Which package?",
  });
  const listed = httpClarifyQueue.listPending("session_test");
  assert.equal(listed.length, 1);
  const resolved = httpClarifyQueue.resolveClarify(listed[0]!.id, "packages/core, pnpm test");
  assert.equal(resolved?.status, "answered");
  const result = await pending;
  assert.match(result.answer, /packages\/core/);
}
