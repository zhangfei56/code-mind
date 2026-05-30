import assert from "node:assert/strict";
import { resolveDisplayMode, showsEventLog, showsTraceDetail } from "../../apps/cli/src/ui/display-level.js";
import { formatTokenCount, formatContextUsage, outcomeGlyph } from "../../apps/cli/src/ui/format.js";
import { formatStepHeader } from "../../apps/cli/src/ui/agent-output/step-title.js";
import { ActivityPane } from "../../apps/cli/src/ui/agent-output/activity-pane.js";
import {
  formatToolCallLine,
  formatToolCallLineFromResult,
} from "../../apps/cli/src/ui/agent-output/tool-call-line.js";
import { StepJournalRenderer } from "../../apps/cli/src/ui/agent-output/step-journal.js";
import { renderAgentEventLine, renderProgressJournalLine } from "../../apps/cli/src/ui/event-lines.js";
import { ProgressPrinter } from "../../apps/cli/src/ui/progress-printer.js";
import {
  createReplDisplayState,
  handleReplDisplayEvent,
  renderReplActivitySection,
  renderReplStatusBar,
  renderReplUserLine,
} from "../../apps/cli/src/ui/repl/repl-display.js";
import {
  applyTuiEvent,
  createTuiState,
  setAgentPlan,
  setPendingApproval,
  statusLine,
  tuiPlanSteps,
  visibleActivityRows,
} from "../../apps/cli/src/tui/state.js";
import {
  renderFixedToast,
  renderTuiMainContent,
  renderTuiStatusLine,
} from "../../apps/cli/src/tui/presentation.js";
import {
  completeSlashCommand,
  describeSlashCommand,
  listSlashCommandMatches,
  renderSlashCommandCompletions,
} from "../../apps/cli/src/tui/commands.js";
import { buildRuntimePlan } from "@code-mind/core";
import { runMockDisplayScenarios } from "../../scripts/mock-display-run.js";
import type { AgentEvent, EventKind } from "@code-mind/shared";

function mockEvent(kind: EventKind, payload: Record<string, unknown>, seq = 1): AgentEvent {
  return {
    id: `evt_${seq}`,
    ts: new Date().toISOString(),
    runId: "run_test",
    sessionId: "s1",
    seq,
    kind,
    level: "info",
    source: { component: "test", surface: "cli" },
    payload,
  };
}

export async function runDisplayTests(): Promise<void> {
  assert.equal(resolveDisplayMode({}), 0);
  assert.equal(resolveDisplayMode({ interactive: true }), 1);
  assert.equal(resolveDisplayMode({ verbose: true }), 2);
  assert.equal(resolveDisplayMode({ trace: true }), 3);
  assert.equal(resolveDisplayMode({ debug: true }), 4);
  assert.equal(resolveDisplayMode({ json: true }), "json");
  assert.equal(resolveDisplayMode({ jsonl: true }), "jsonl");
  assert.equal(showsEventLog(2), true);
  assert.equal(showsEventLog(0), false);
  assert.equal(showsTraceDetail(3), true);
  assert.equal(showsTraceDetail(2), false);

  assert.equal(formatTokenCount(950), "950");
  assert.equal(formatTokenCount(4200), "4.2k");
  assert.match(formatContextUsage(38_000, 128_000), /38\.0k\/128\.0k \(30%\)/);
  assert.equal(outcomeGlyph("success"), "✓");
  assert.equal(outcomeGlyph("failed"), "✕");
  assert.equal(outcomeGlyph("stopped_by_limit"), "⚠");

  assert.equal(formatStepHeader(2, 12, "reading"), "Step 2/12 Reading");

  assert.match(
    formatToolCallLine(
      { id: "t1", name: "list_dir", arguments: { path: "." } },
      "pending",
    ),
    /list_dir\s+\./,
  );
  assert.match(
    formatToolCallLine(
      { id: "t2", name: "grep", arguments: { pattern: "foo|bar", path: "src" } },
      "done",
      { durationMs: 120 },
    ),
    /grep\s+"foo\|bar"/,
  );
  assert.match(
    formatToolCallLineFromResult({
      toolCall: { id: "t3", name: "run_shell", arguments: { command: "pnpm test" } },
      success: true,
      exitCode: 0,
      durationMs: 900,
    }) ?? "",
    /run_shell\s+pnpm test\s+✓/,
  );

  const pane = new ActivityPane({ height: 3, width: 40 });
  pane.appendPendingTool({ id: "a", name: "read_file", arguments: { path: "a.ts" } });
  pane.appendPendingTool({ id: "b", name: "read_file", arguments: { path: "b.ts" } });
  pane.appendPendingTool({ id: "c", name: "read_file", arguments: { path: "c.ts" } });
  pane.appendPendingTool({ id: "d", name: "read_file", arguments: { path: "d.ts" } });
  const rendered = pane.render({ viewport: true, bordered: false });
  assert.equal(rendered.length, 3);
  assert.match(rendered[2]!, /d\.ts/);

  const journal = new StepJournalRenderer({ level: 1, tty: false });
  const seq = [
    mockEvent("step.started", { step: 1, maxSteps: 4 }, 1),
    mockEvent(
      "model.response",
      {
        step: 1,
        maxSteps: 4,
        toolCallCount: 1,
        textPreview: "我将阅读项目结构。",
        plannedToolCalls: [{ id: "t1", name: "list_dir", arguments: { path: "." } }],
      },
      2,
    ),
    mockEvent(
      "tool.result",
      {
        step: 1,
        maxSteps: 4,
        toolCall: { id: "t1", name: "list_dir", arguments: { path: "." } },
        success: true,
        outputPreview: "package.json\nsrc/",
      },
      3,
    ),
  ];
  const journalText = seq.flatMap((event) => journal.handleEvent(event).lines).join("\n");
  assert.match(journalText, /我将阅读项目结构/);
  assert.match(journalText, /list_dir/);
  assert.match(journalText, /✓/);

  const traceLine = renderAgentEventLine(
    mockEvent("model.response", {
      step: 1,
      maxSteps: 10,
      finishReason: "stop",
      toolCallCount: 0,
      contextTokens: 38_000,
      maxContextTokens: 128_000,
      usage: { inputTokens: 38_000, outputTokens: 900, totalTokens: 38_900 },
      durationMs: 1200,
      textPreview: "hello",
    }),
    { trace: true },
  );
  assert.ok(traceLine);
  assert.match(traceLine!, /ctx 38\.0k\/128\.0k/);
  assert.match(traceLine!, /in 38\.0k · out 900/);

  assert.equal(
    renderAgentEventLine(
      mockEvent("model.reasoning.delta", { step: 1, delta: "secret", totalLength: 6 }),
      { trace: true },
    ),
    null,
  );
  assert.equal(
    renderAgentEventLine(
      mockEvent("model.content.delta", { step: 1, delta: "hello", totalLength: 5 }),
      { trace: true },
    ),
    null,
  );
  assert.equal(
    renderAgentEventLine(mockEvent("process.log", { message: "Dispatching model request." }), {
      trace: true,
    }),
    null,
  );

  const toolModelLine = renderAgentEventLine(
    mockEvent("model.response", {
      step: 1,
      maxSteps: 10,
      finishReason: "tool_call",
      toolCallCount: 2,
      durationMs: 900,
      reasoningLength: 120,
      contextTokens: 3500,
      maxContextTokens: 128_000,
    }),
    { trace: true },
  );
  assert.ok(toolModelLine);
  assert.match(toolModelLine!, /model → 2 tool calls/);
  assert.match(toolModelLine!, /reasoning 120 chars/);
  assert.doesNotMatch(toolModelLine!, /secret/);

  assert.equal(
    renderProgressJournalLine(mockEvent("step.started", { step: 2, maxSteps: 12 }), {
      activity: "reading",
    }),
    "Step 2/12 Reading",
  );
  assert.equal(
    renderProgressJournalLine(
      mockEvent("tool.result", {
        step: 2,
        maxSteps: 12,
        toolCall: { id: "t1", name: "read_file", arguments: { path: "README.md" } },
        success: true,
      }),
    ),
    "  ✓ Read README.md",
  );

  const lines: string[] = [];
  const stream = {
    isTTY: false,
    write(chunk: string) {
      lines.push(chunk);
      return true;
    },
  } as NodeJS.WriteStream;

  const printer = new ProgressPrinter({ level: 0, stream });
  printer.printHeader("explain repo", "edit", "/tmp/project");
  assert.match(lines.join(""), /Task\n  explain repo/);
  assert.match(lines.join(""), /Workspace\n  Path: /);

  const events: string[] = [];
  const eventStream = {
    isTTY: true,
    write(chunk: string) {
      events.push(chunk);
      return true;
    },
  } as NodeJS.WriteStream;

  const live = new ProgressPrinter({ level: 0, stream: eventStream });
  live.printHeader("explain repo", "edit", "/tmp/project");
  void live.onEvent(mockEvent("step.started", { step: 2, maxSteps: 12 }, 1));
  void live.onEvent(
    mockEvent(
      "model.response",
      {
        step: 2,
        maxSteps: 12,
        toolCallCount: 1,
        textPreview: "I'll inspect the repository layout.",
        plannedToolCalls: [{ id: "t1", name: "list_dir", arguments: { path: "." } }],
      },
      2,
    ),
  );
  void live.onEvent(
    mockEvent(
      "tool.result",
      {
        step: 2,
        maxSteps: 12,
        toolCall: { id: "t1", name: "list_dir", arguments: { path: "." } },
        success: true,
        outputPreview: "package.json\napps/",
      },
      3,
    ),
  );
  await live.onEvent(
    mockEvent(
      "turn.finished",
      {
        status: "success",
        steps: 2,
        finalText: "done",
        mode: "edit",
        completion: "diagnosed_only",
      },
      3,
    ),
  );
  live.dispose();
  const eventText = events.join("");
  assert.match(eventText, /list_dir/);
  assert.match(eventText, /inspect the repository layout/);
  assert.ok(eventText.includes("✓ 2 steps · success"));
  assert.ok(!eventText.includes("Step 2/12"));

  const normalLines: string[] = [];
  const normalStream = {
    isTTY: false,
    write(chunk: string) {
      normalLines.push(chunk);
      return true;
    },
  } as NodeJS.WriteStream;
  const normalPrinter = new ProgressPrinter({ level: 1, stream: normalStream });
  normalPrinter.printHeader("explain repo", "edit", "/tmp/project", {
    configuredModelName: "deepseek-chat",
  });
  await normalPrinter.onEvent(
    mockEvent("turn.started", {
      modelName: "deepseek",
      maxSteps: 4,
      requestedMaxSteps: 4,
      baseMaxSteps: 4,
      mode: "edit",
    }),
  );
  assert.equal(normalLines.join("").match(/Model\n/g)?.length ?? 0, 1);
  assert.doesNotMatch(normalLines.join(""), /\nModel\n  deepseek\n/);

  const jsonlLines: string[] = [];
  const jsonlStream = {
    isTTY: false,
    write(chunk: string) {
      jsonlLines.push(chunk);
      return true;
    },
  } as NodeJS.WriteStream;
  const jsonlPrinter = new ProgressPrinter({ level: "jsonl", stream: jsonlStream });
  jsonlPrinter.printHeader("explain repo", "edit", "/tmp/project", {
    workspaceRoot: "/tmp/project",
  });
  await jsonlPrinter.onEvent(mockEvent("step.started", { step: 1, maxSteps: 4 }));
  const jsonlResult = jsonlPrinter.renderResult(
    {
      id: "task_jsonl",
      text: "explain repo",
      cwd: "/tmp/project",
      mode: "edit",
      maxSteps: 4,
    },
    {
      sessionId: "s1",
      runId: "run_test",
      status: "success",
      finalText: "done",
      steps: 1,
      modelName: "fake",
    },
  );
  assert.match(jsonlLines[0] ?? "", /"type":"header"/);
  assert.match(jsonlLines[1] ?? "", /"kind":"step.started"/);
  assert.match(jsonlResult, /"type":"result"/);

  const replState = createReplDisplayState({
    mode: "edit",
    model: "deepseek",
    cwd: "/tmp/project",
    gitSummary: "main, clean",
  });
  assert.match(renderReplUserLine("fix tests"), /user\s+fix tests/);
  assert.match(renderReplStatusBar(replState), /code-mind/);
  assert.match(renderReplStatusBar(replState), /main, clean/);

  handleReplDisplayEvent(replState, mockEvent("turn.started", { maxSteps: 6, modelName: "deepseek" }, 10));
  handleReplDisplayEvent(replState, mockEvent("step.started", { step: 4, maxSteps: 6 }, 11));
  handleReplDisplayEvent(
    replState,
    mockEvent("tool.result", {
      success: true,
      durationMs: 12,
      toolCall: { id: "t1", name: "read_file", arguments: { path: "package.json" } },
    }, 12),
  );
  const activity = renderReplActivitySection(replState).join("\n");
  assert.match(activity, /Activity \(latest\)/);
  assert.match(activity, /read_file/);
  assert.match(activity, /package\.json/);

  const replLines: string[] = [];
  const replStream = {
    isTTY: false,
    write(chunk: string) {
      replLines.push(chunk);
      return true;
    },
  } as NodeJS.WriteStream;
  const replPrinter = new ProgressPrinter({
    level: 1,
    surface: "repl",
    replContext: { mode: "edit", model: "deepseek", cwd: "/tmp/project" },
    stream: replStream,
  });
  await replPrinter.onEvent(mockEvent("turn.started", { maxSteps: 4, modelName: "deepseek" }, 20));
  await replPrinter.onEvent(mockEvent("tool.result", {
    success: false,
    exitCode: 1,
    durationMs: 8200,
    toolCall: { id: "t2", name: "run_shell", arguments: { command: "pnpm test" } },
  }, 21));
  const replOutput = replLines.join("");
  assert.match(replOutput, /Activity \(latest\)/);
  assert.match(replOutput, /run_shell/);

  const tuiState = createTuiState({
    cwd: "/tmp/project",
    model: "deepseek",
    mode: "edit",
    gitSummary: "main (clean)",
  });
  applyTuiEvent(tuiState, mockEvent("turn.started", { maxSteps: 6, modelName: "deepseek" }, 30));
  applyTuiEvent(tuiState, mockEvent("step.started", { step: 4, maxSteps: 6 }, 31));
  applyTuiEvent(tuiState, mockEvent("model.response", {
    toolCallCount: 1,
    textPreview: "Compare parser behavior with failing expectations.",
    plannedToolCalls: [
      { id: "tc1", name: "read_file", arguments: { path: "src/utils/parser.ts" } },
    ],
  }, 32));
  applyTuiEvent(tuiState, mockEvent("tool.result", {
    success: false,
    exitCode: 1,
    durationMs: 8200,
    toolCall: { id: "tc2", name: "run_shell", arguments: { command: "pnpm test" } },
  }, 33));
  assert.match(statusLine(tuiState), /code-mind/);
  assert.match(statusLine(tuiState), /step 4\/6/);
  assert.match(tuiState.thinkingFocus, /Compare parser/);
  assert.match(tuiPlanSteps(tuiState)[0]?.label ?? "", /parser/);
  assert.equal(visibleActivityRows(tuiState)[0]?.tool, "run_shell");
  setPendingApproval(tuiState, {
    id: "approval_1",
    sessionId: "s1",
    toolCallId: "tc3",
    toolName: "run_shell",
    reason: "needs shell",
    status: "pending",
    createdAt: new Date().toISOString(),
  });
  assert.equal(tuiState.overlay, "approval");

  const idleState = createTuiState({
    cwd: "/tmp/project",
    model: "deepseek",
    mode: "edit",
  });
  assert.equal(tuiPlanSteps(idleState).length, 0);
  assert.match(renderTuiStatusLine(tuiState), /\|/);
  assert.match(renderTuiMainContent(tuiState), /Activity/);
  assert.match(renderTuiMainContent(tuiState), /✓\{\/green-fg\} 1\./);
  assert.match(renderFixedToast(tuiState, false), /Viewing history/);

  const { plan } = buildRuntimePlan(
    { id: "task_plan", text: "fix tests", cwd: "/tmp/project", mode: "edit", maxSteps: 6 },
    "1. Locate test command\n2. Reproduce failure\n3. Inspect parser\n4. Patch fix\n5. Run validation",
  );
  const planState = createTuiState({
    cwd: "/tmp/project",
    model: "deepseek",
    mode: "edit",
  });
  setAgentPlan(planState, plan);
  planState.planStepIndex = 3;
  assert.equal(tuiPlanSteps(planState).length, 5);
  assert.equal(tuiPlanSteps(planState)[3]?.status, "current");
  assert.match(tuiPlanSteps(planState)[0]?.label ?? "", /Locate test command/);

  planState.verbose = true;
  assert.match(statusLine(planState), /verbose/);
  assert.equal(completeSlashCommand("/st", 0), "/status");
  assert.equal(completeSlashCommand("/ver", 0), "/verbose");
  assert.deepEqual(listSlashCommandMatches("/a"), ["abort", "approvals", "approve", "approve-always"]);
  assert.deepEqual(listSlashCommandMatches("/model deepseek"), []);
  assert.match(describeSlashCommand("events"), /runtime events/);
  assert.match(renderSlashCommandCompletions("/ap", 1), /approve-always/);
  assert.match(renderSlashCommandCompletions("/ev", 0), /raw recent runtime events/);

  await runMockDisplayScenarios();
}
