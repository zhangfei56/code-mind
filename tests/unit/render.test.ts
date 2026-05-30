import assert from "node:assert/strict";
import { renderTaskResult } from "../../apps/cli/src/ui/render.js";
import { renderRunHeader } from "../../apps/cli/src/ui/agent-output/blocks.js";

export function runRenderTests(): void {
  const previous = process.env.NO_COLOR;
  process.env.NO_COLOR = "1";

  const output = renderTaskResult(
    {
      id: "task_1",
      text: "explain this repo",
      cwd: "/tmp/code-mind",
      mode: "edit",
      maxSteps: 10,
    },
    {
      sessionId: "session_abc123",
      status: "success",
      finalText: "This is a code agent CLI.",
      steps: 1,
      modelName: "deepseek",
      metadata: { completion: "diagnosed_only" },
    },
  );

  assert.match(output, /This is a code agent CLI\./);
  assert.doesNotMatch(output, /session_abc123/);
  assert.doesNotMatch(output, /^Task:/m);
  assert.doesNotMatch(output, /^Summary:/m);

  const verbose = renderTaskResult(
    {
      id: "task_1",
      text: "explain this repo",
      cwd: "/tmp/code-mind",
      mode: "edit",
      maxSteps: 10,
    },
    {
      sessionId: "session_abc123",
      status: "success",
      finalText: "This is a code agent CLI.",
      steps: 1,
      modelName: "deepseek",
      metadata: { completion: "diagnosed_only" },
    },
    { verbose: true },
  );
  assert.match(verbose, /session_abc123/);
  assert.match(verbose, /success/);

  const normal = renderTaskResult(
    {
      id: "task_1",
      text: "explain this repo",
      cwd: "/tmp/code-mind",
      mode: "edit",
      maxSteps: 10,
    },
    {
      sessionId: "session_abc123",
      status: "success",
      finalText: "This is a code agent CLI.",
      steps: 1,
      modelName: "deepseek",
      metadata: { completion: "diagnosed_only" },
    },
    { level: 1 },
  );
  assert.match(normal, /This is a code agent CLI\./);
  assert.match(normal, /success · 1 step · deepseek/);
  assert.match(normal, /code-mind sessions show session_abc123/);
  assert.match(normal, /Completed after gathering enough evidence to answer\./);

  const header = renderRunHeader({
    task: "explain this repo",
    mode: "edit",
    cwd: "/tmp/code-mind",
    workspaceRoot: "/tmp/code-mind",
    gitSummary: "main, clean",
    modelProvider: "deepseek",
    configuredModelName: "deepseek-chat",
    toolCount: 16,
    mcpServerCount: 2,
    configLines: ["config: ~/.agent/config.yaml"],
    level: 2,
  }).join("\n");
  assert.match(header, /Workspace/);
  assert.match(header, /Understanding/);
  assert.match(header, /Git: main, clean/);
  assert.match(header, /Provider: deepseek/);
  assert.match(header, /Model: deepseek-chat/);
  assert.match(header, /Available: 16/);
  assert.match(header, /MCP: 2 configured/);
  assert.match(header, /config: ~\/\.agent\/config\.yaml/);

  const detailed = renderTaskResult(
    {
      id: "task_2",
      text: "fix auth bug",
      cwd: "/tmp/code-mind",
      mode: "edit",
      maxSteps: 10,
    },
    {
      sessionId: "session_fix123",
      status: "success",
      finalText: "Fixed the auth bug.",
      steps: 3,
      modelName: "deepseek",
      metadata: {
        completion: "modified_verified",
        changedFiles: [
          { path: "src/auth.ts", status: "M" },
          { path: "tests/auth.test.ts", status: "A" },
        ],
      },
    },
    { level: 1 },
  );
  assert.match(detailed, /Files changed/);
  assert.match(detailed, /A tests\/auth\.test\.ts/);
  assert.match(detailed, /src\/auth\.ts/);
  assert.match(detailed, /Added test coverage\./);
  assert.match(detailed, /Updated source behavior\./);
  assert.match(detailed, /Review/);
  assert.match(detailed, /git diff/);

  const tableFormatted = renderTaskResult(
    {
      id: "task_3",
      text: "explain layers",
      cwd: "/tmp/code-mind",
      mode: "ask",
      maxSteps: 10,
    },
    {
      sessionId: "session_table123",
      status: "success",
      finalText: [
        "| Layer | Role | Package |",
        "| --- | --- | --- |",
        "| CLI | entry | apps/cli |",
        "| Core | orchestration | packages/core |",
      ].join("\n"),
      steps: 1,
      modelName: "deepseek",
      metadata: { completion: "diagnosed_only" },
    },
    { level: 1 },
  );
  assert.match(tableFormatted, /- Layer: CLI/);
  assert.match(tableFormatted, /Package: packages\/core/);
  assert.doesNotMatch(tableFormatted, /\| Layer \| Role \| Package \|/);

  process.env.NO_COLOR = previous;
}
