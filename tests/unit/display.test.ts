import assert from "node:assert/strict";
import { resolveDisplayMode, showsEventLog, showsTraceDetail } from "../../apps/cli/src/ui/display-level.js";
import { formatTokenCount, formatContextUsage, outcomeGlyph } from "../../apps/cli/src/ui/format.js";
import { formatStepHeader } from "../../apps/cli/src/ui/agent-output/step-title.js";
import { ActivityPane } from "../../apps/cli/src/ui/agent-output/activity-pane.js";
import {
  formatToolCallLine,
  formatToolCallLineFromResult,
} from "../../apps/cli/src/ui/agent-output/tool-call-line.js";
import { renderApprovalBlock } from "../../apps/cli/src/ui/agent-output/blocks.js";
import { StepJournalRenderer } from "../../apps/cli/src/ui/agent-output/step-journal.js";
import { displayWidth } from "../../apps/cli/src/ui/text-wrap.js";
import { renderAgentEventLine, renderProgressJournalLine } from "../../apps/cli/src/ui/event-lines.js";
import { renderTurnFinishedLine } from "../../apps/cli/src/ui/result-summary.js";
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

  const compactPane = new ActivityPane({ height: 8, width: 40 });
  compactPane.appendPendingTool({ id: "one", name: "read_file", arguments: { path: "config.ts" } });
  const bordered = compactPane.render({ viewport: true, bordered: true });
  assert.equal(bordered.length, 3);
  assert.match(bordered[1]!, /read_file/);
  assert.doesNotMatch(bordered.join("\n"), /^│\s*$/m);

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

  const reasoningHiddenJournal = new StepJournalRenderer({ level: 1, tty: false });
  const reasoningHiddenText = [
    reasoningHiddenJournal.handleEvent(mockEvent("step.started", { step: 1, maxSteps: 4 }, 4)),
    reasoningHiddenJournal.handleEvent(mockEvent("model.request", { step: 1, maxSteps: 4 }, 5)),
    reasoningHiddenJournal.handleEvent(mockEvent("model.reasoning.delta", { totalLength: 394 }, 6)),
    reasoningHiddenJournal.handleEvent(mockEvent("model.response", {
      step: 1,
      maxSteps: 4,
      toolCallCount: 1,
      plannedToolCalls: [{ id: "t2", name: "read_file", arguments: { path: "tests/unit/config.test.ts" } }],
    }, 7)),
  ].flatMap((output) => output.lines).join("\n");
  assert.doesNotMatch(reasoningHiddenText, /reasoning/);
  assert.doesNotMatch(reasoningHiddenText, /394 chars/);

  const reasoningTraceJournal = new StepJournalRenderer({ level: 3, tty: false });
  const reasoningTraceText = [
    reasoningTraceJournal.handleEvent(mockEvent("step.started", { step: 1, maxSteps: 4 }, 8)),
    reasoningTraceJournal.handleEvent(mockEvent("model.request", { step: 1, maxSteps: 4 }, 9)),
    reasoningTraceJournal.handleEvent(mockEvent("model.reasoning.delta", { totalLength: 394 }, 10)),
    reasoningTraceJournal.handleEvent(mockEvent("model.response", {
      step: 1,
      maxSteps: 4,
      toolCallCount: 1,
      plannedToolCalls: [{ id: "t3", name: "read_file", arguments: { path: "tests/unit/config.test.ts" } }],
    }, 11)),
  ].flatMap((output) => output.lines).join("\n");
  assert.match(reasoningTraceText, /reasoning/);
  assert.match(reasoningTraceText, /394 chars/);

  const streamJournal = new StepJournalRenderer({ level: 1, tty: true, paneWidth: 60 });
  streamJournal.handleEvent(mockEvent("step.started", { step: 1, maxSteps: 4 }, 20));
  streamJournal.handleEvent(mockEvent("model.request", { step: 1, maxSteps: 4 }, 21));
  const streamOut1 = streamJournal.handleEvent(
    mockEvent("model.content.delta", { step: 1, delta: "我将", totalLength: 2 }, 22),
  );
  const streamOut2 = streamJournal.handleEvent(
    mockEvent("model.content.delta", { step: 1, delta: "阅读项目结构", totalLength: 8 }, 23),
  );
  assert.ok(streamOut1.previewLine?.includes("thinking"));
  assert.match(streamOut1.previewLine ?? "", /我将…/);
  assert.match(streamOut2.previewLine ?? "", /项目结构/);
  assert.notEqual(streamOut2.redrawPane, true);
  assert.doesNotMatch(streamOut2.previewLine ?? "", /^─/);
  const previewWidth = displayWidth(streamOut2.previewLine ?? "");
  assert.ok(previewWidth <= 60, `preview too wide: ${previewWidth}`);

  const tailJournal = new StepJournalRenderer({
    level: 1,
    tty: true,
    paneWidth: 80,
    stream: { columns: 80 } as NodeJS.WriteStream,
  });
  tailJournal.handleEvent(mockEvent("step.started", { step: 1, maxSteps: 4 }, 40));
  tailJournal.handleEvent(mockEvent("model.request", { step: 1, maxSteps: 4 }, 41));
  const longText =
    "找到了失败的测试：config 测试在 tests/unit/config.test.ts:34 行，期望 debug 但实际得到 info";
  const tailOut = tailJournal.handleEvent(
    mockEvent("model.content.delta", { step: 1, delta: longText, totalLength: longText.length }, 42),
  );
  assert.match(tailOut.previewLine ?? "", /^  thinking\s+/);
  assert.doesNotMatch(tailOut.previewLine ?? "", /找到了失败的测试/);

  const finalizeJournal = new StepJournalRenderer({ level: 1, tty: true, paneWidth: 60 });
  finalizeJournal.handleEvent(mockEvent("step.started", { step: 1, maxSteps: 4 }, 43));
  finalizeJournal.handleEvent(mockEvent("model.request", { step: 1, maxSteps: 4 }, 44));
  finalizeJournal.handleEvent(
    mockEvent("model.content.delta", { step: 1, delta: "我将阅读项目结构。", totalLength: 9 }, 45),
  );
  const finalizeOut = finalizeJournal.handleEvent(
    mockEvent("model.response", {
      step: 1,
      maxSteps: 4,
      toolCallCount: 1,
      textPreview: "我将阅读项目结构。",
      plannedToolCalls: [{ id: "t5", name: "list_dir", arguments: { path: "." } }],
    }, 46),
  );
  assert.ok(finalizeOut.finalizeLines?.some((line) => line.includes("我将阅读项目结构")));
  assert.equal(finalizeOut.lines.some((line) => line.includes("我将阅读项目结构")), false);

  const dsmlJournal = new StepJournalRenderer({ level: 1, tty: false });
  dsmlJournal.handleEvent(mockEvent("step.started", { step: 1, maxSteps: 4 }, 47));
  const dsmlOut = dsmlJournal.handleEvent(
    mockEvent("model.response", {
      step: 1,
      maxSteps: 4,
      toolCallCount: 1,
      textPreview: [
        "before",
        "<｜｜DSML｜｜tool_calls>",
        '{"name":"read_file","arguments":{"path":"README.md"}}',
        "</｜｜DSML｜｜tool_calls>",
        "after",
      ].join("\n"),
      plannedToolCalls: [{ id: "t_dsml", name: "read_file", arguments: { path: "README.md" } }],
    }, 48),
  );
  const dsmlText = dsmlOut.lines.join("\n");
  assert.doesNotMatch(dsmlText, /DSML/);
  assert.doesNotMatch(dsmlText, /<｜/);
  assert.match(dsmlText, /before/);

  const streamedDsmlJournal = new StepJournalRenderer({ level: 1, tty: false });
  streamedDsmlJournal.handleEvent(mockEvent("step.started", { step: 11, maxSteps: 12 }, 53));
  const streamedDsmlOut = streamedDsmlJournal.handleEvent(
    mockEvent("model.response", {
      step: 11,
      maxSteps: 12,
      toolCallCount: 1,
      textPreview: [
        "<",
        "｜｜DSML｜｜",
        "tool",
        "_c",
        "alls",
        ">",
        "<",
        "｜｜DSML｜｜",
        "invoke",
        ' name="read_file">',
        "<",
        "｜｜DSML｜｜",
        "parameter",
        ' name="path"',
        ' string="true">',
        "packages/config/src/load-config.ts",
        "</",
        "｜｜DSML｜｜",
        "parameter",
        ">",
        "</",
        "｜｜DSML｜｜",
        "invoke",
        ">",
        "</",
        "｜｜DSML｜｜",
        "tool",
        "_c",
        "alls",
        ">",
      ].join("\n"),
      plannedToolCalls: [
        { id: "t_stream", name: "read_file", arguments: { path: "packages/config/src/load-config.ts" } },
      ],
    }, 54),
  );
  const streamedDsmlText = streamedDsmlOut.lines.join("\n");
  assert.doesNotMatch(streamedDsmlText, /DSML/);
  assert.doesNotMatch(streamedDsmlText, /<｜/);
  assert.match(streamedDsmlText, /read_file|load-config|我将/);

  const flatJournal = new StepJournalRenderer({ level: 1, tty: true, flatActivityLog: true });
  flatJournal.handleEvent(mockEvent("step.started", { step: 1, maxSteps: 4 }, 49));
  flatJournal.handleEvent(
    mockEvent("model.response", {
      step: 1,
      maxSteps: 4,
      toolCallCount: 1,
      textPreview: "我将读取 README。",
      plannedToolCalls: [{ id: "t_flat", name: "read_file", arguments: { path: "README.md" } }],
    }, 50),
  );
  const flatOut1 = flatJournal.handleEvent(
    mockEvent("tool.call", {
      step: 1,
      toolCall: { id: "t_flat", name: "read_file", arguments: { path: "README.md" } },
    }, 51),
  );
  const flatOut2 = flatJournal.handleEvent(
    mockEvent("tool.result", {
      step: 1,
      success: true,
      toolCall: { id: "t_flat", name: "read_file", arguments: { path: "README.md" } },
    }, 52),
  );
  const flatText = [...flatOut1.lines, ...flatOut2.lines].join("\n");
  assert.doesNotMatch(flatText, /^─/m);
  assert.doesNotMatch(flatText, /^\│/m);
  assert.ok((flatText.match(/read_file/g) ?? []).length <= 2);

  const reasoningFallbackJournal = new StepJournalRenderer({ level: 1, tty: true, paneWidth: 60 });
  reasoningFallbackJournal.handleEvent(mockEvent("step.started", { step: 1, maxSteps: 4 }, 24));
  reasoningFallbackJournal.handleEvent(mockEvent("model.request", { step: 1, maxSteps: 4 }, 25));
  const reasoningPreviewOut = reasoningFallbackJournal.handleEvent(
    mockEvent("model.reasoning.delta", { step: 1, delta: "分析失败原因", totalLength: 6 }, 26),
  );
  assert.ok(reasoningPreviewOut.previewLine?.includes("分析失败原因"));
  assert.doesNotMatch(reasoningPreviewOut.previewLine ?? "", /reasoning\s+\(/);

  const wrapJournal = new StepJournalRenderer({ level: 1, tty: false, paneWidth: 40, stream: { columns: 40 } as NodeJS.WriteStream });
  wrapJournal.handleEvent(mockEvent("step.started", { step: 1, maxSteps: 4 }, 27));
  const wrapOut = wrapJournal.handleEvent(
    mockEvent("model.response", {
      step: 1,
      maxSteps: 4,
      toolCallCount: 1,
      textPreview: "我将阅读整个项目结构并定位失败测试相关的配置加载逻辑。",
      plannedToolCalls: [{ id: "t4", name: "list_dir", arguments: { path: "." } }],
    }, 28),
  );
  assert.ok(wrapOut.lines.length >= 2);
  for (const line of wrapOut.lines) {
    assert.ok(line.length <= 40, `line too long: ${line}`);
  }

  const skipStreamJournal = new StepJournalRenderer({ level: 1, tty: true, paneWidth: 60 });
  skipStreamJournal.handleEvent(mockEvent("step.started", { step: 1, maxSteps: 4 }, 29));
  skipStreamJournal.handleEvent(
    mockEvent("model.request", { step: 1, maxSteps: 4, streamContent: true }, 30),
  );
  const skipOut = skipStreamJournal.handleEvent(
    mockEvent("model.content.delta", { step: 1, delta: "final answer", totalLength: 12 }, 31),
  );
  assert.notEqual(skipOut.redrawPane, true);

  const approvalEvent = mockEvent("approval.requested", {
    step: 1,
    maxSteps: 10,
    approvalId: "approval_wrap",
    toolCall: {
      id: "call_wrap",
      name: "run_shell",
      arguments: { command: "cd /tmp && pnpm test --filter config --reporter verbose" },
    },
    reason: "Command requires explicit approval because it runs shell in workspace.",
  }, 32);
  const approvalLines = renderApprovalBlock(approvalEvent, { columns: 36 } as NodeJS.WriteStream);
  const approvalText = approvalLines.join("\n");
  const bodyLines = approvalLines.filter(
    (line) => line.startsWith("  ") && !line.includes("[y]"),
  );
  assert.ok(bodyLines.length >= 2);
  for (const line of bodyLines) {
    assert.ok(line.length <= 36, `approval body line too long: ${line}`);
  }
  assert.match(approvalText, /Reason/);

  const previewPane = new ActivityPane({ width: 48 });
  previewPane.setThinkingPreview("我将 read package.json 并运行 pnpm test 验证修复");
  assert.match(previewPane.render({ bordered: true }).join("\n"), /thinking\s+我将 read/);

  const finalPreviewJournal = new StepJournalRenderer({ level: 1, tty: false });
  const finalPreviewLines = finalPreviewJournal.handleEvent(
    mockEvent("model.response", {
      step: 1,
      maxSteps: 4,
      toolCallCount: 0,
      textPreview: "## code-mind 项目概述\n\n这是一个 local-first code agent。",
    }),
  ).lines.join("\n");
  assert.equal(finalPreviewLines, "");

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

  const inputSafeChunks: string[] = [];
  const inputSafeStream = {
    isTTY: true,
    columns: 80,
    write(chunk: string) {
      inputSafeChunks.push(chunk);
      return true;
    },
  } as NodeJS.WriteStream;
  const inputSafePrinter = new ProgressPrinter({ level: 1, stream: inputSafeStream });
  await inputSafePrinter.onEvent(
    mockEvent("step.started", { step: 1, maxSteps: 4 }, 40),
  );
  await inputSafePrinter.onEvent(
    mockEvent(
      "model.reasoning.delta",
      { step: 1, delta: "thinking about the repo layout", totalLength: 30 },
      41,
    ),
  );
  assert.ok(inputSafeChunks.join("").includes("\r"), "preview should use in-place updates before pause");
  inputSafePrinter.pauseForInput();
  const afterPause = inputSafeChunks.length;
  await inputSafePrinter.onEvent(
    mockEvent(
      "model.reasoning.delta",
      { step: 1, delta: " more reasoning", totalLength: 45 },
      42,
    ),
  );
  assert.equal(inputSafeChunks.length, afterPause, "preview updates suppressed while input paused");
  inputSafePrinter.resumeAfterInput();
  await inputSafePrinter.onEvent(
    mockEvent("approval.requested", {
      step: 1,
      maxSteps: 4,
      approvalId: "approval_input_safe",
      toolCall: { id: "t5", name: "read_file", arguments: { path: "README.md" } },
      reason: "Needs approval.",
    }, 43),
  );
  const approvalOutput = inputSafeChunks.slice(afterPause).join("");
  assert.match(approvalOutput, /Approval required/);
  await inputSafePrinter.onEvent(
    mockEvent("approval.resolved", {
      step: 1,
      approved: true,
      approvalId: "approval_input_safe",
      toolCall: { id: "t5", name: "read_file", arguments: { path: "README.md" } },
    }, 44),
  );
  const afterApprovalResolved = inputSafeChunks.length;
  await inputSafePrinter.onEvent(
    mockEvent(
      "model.reasoning.delta",
      { step: 1, delta: "resumed preview", totalLength: 14 },
      45,
    ),
  );
  assert.ok(
    inputSafeChunks.slice(afterApprovalResolved).join("").includes("\r"),
    "preview resumes after approval.resolved",
  );

  const interactiveRunChunks: string[] = [];
  const interactiveRunStream = {
    isTTY: true,
    columns: 80,
    write(chunk: string) {
      interactiveRunChunks.push(chunk);
      return true;
    },
  } as NodeJS.WriteStream;
  const interactiveRunPrinter = new ProgressPrinter({
    level: 1,
    stream: interactiveRunStream,
    interactiveTerminal: true,
  });
  await interactiveRunPrinter.onEvent(mockEvent("step.started", { step: 1, maxSteps: 4 }, 46));
  await interactiveRunPrinter.onEvent(
    mockEvent("model.reasoning.delta", { step: 1, delta: "live thought", totalLength: 10 }, 47),
  );
  await interactiveRunPrinter.onEvent(
    mockEvent("tool.call", {
      step: 1,
      toolCall: { id: "t6", name: "run_shell", arguments: { command: "pnpm test" } },
    }, 48),
  );
  await interactiveRunPrinter.onEvent(
    mockEvent("approval.requested", {
      step: 1,
      approvalId: "a1",
      toolCall: { id: "t6", name: "run_shell", arguments: { command: "pnpm test" } },
      reason: "shell",
    }, 49),
  );
  await interactiveRunPrinter.onEvent(
    mockEvent("approval.resolved", { step: 1, approved: false, toolCall: { id: "t6", name: "run_shell", arguments: {} } }, 50),
  );
  await interactiveRunPrinter.onEvent(
    mockEvent("tool.result", {
      step: 1,
      success: false,
      toolCall: { id: "t6", name: "run_shell", arguments: { command: "pnpm test" } },
    }, 51),
  );
  const interactiveRunOutput = interactiveRunChunks.join("");
  assert.ok(!interactiveRunOutput.includes("\r"), "interactiveTerminal disables carriage returns");
  assert.ok(!/\x1b\[\d+A/.test(interactiveRunOutput), "interactiveTerminal disables cursor-up redraws");
  assert.ok(!/\x1b\[2K/.test(interactiveRunOutput), "interactiveTerminal disables in-place line clear");
  assert.equal(
    (interactiveRunOutput.match(/─{10,}/g) ?? []).length,
    0,
    "interactiveTerminal should not stack bordered activity panes",
  );

  const replSafeChunks: string[] = [];
  const replSafeStream = {
    isTTY: true,
    columns: 80,
    write(chunk: string) {
      replSafeChunks.push(chunk);
      return true;
    },
  } as NodeJS.WriteStream;
  const replSafePrinter = new ProgressPrinter({
    level: 1,
    surface: "repl",
    interactiveTerminal: true,
    replContext: { mode: "edit", model: "deepseek", cwd: "/tmp/project" },
    stream: replSafeStream,
  });
  await replSafePrinter.onEvent(mockEvent("turn.started", { maxSteps: 4, modelName: "deepseek" }, 50));
  await replSafePrinter.onEvent(
    mockEvent("activity.updated", { activity: "thinking", detail: "step 1" }, 51),
  );
  await replSafePrinter.onEvent(
    mockEvent("activity.updated", { activity: "reading", detail: "package.json" }, 52),
  );
  const replSafeOutput = replSafeChunks.join("");
  assert.ok(!replSafeOutput.includes("\r"), "REPL suppressInPlace avoids carriage returns");
  assert.ok((replSafeOutput.match(/\n/g) ?? []).length >= 2, "REPL status uses newline output");

  const turnFooter = renderTurnFinishedLine(
    mockEvent("turn.finished", {
      status: "success",
      steps: 5,
      finalText: "done",
      mode: "edit",
      completion: "modified_verified",
      modifiedFilesCount: 2,
      tokenUsage: { inputTokens: 45_200, outputTokens: 3_100, totalTokens: 48_300 },
      contextTokens: 38_000,
      maxContextTokens: 128_000,
    }),
  );
  assert.match(turnFooter, /✓ 5 steps · success/);
  assert.match(turnFooter, /2 files changed/);
  assert.match(turnFooter, /in 45\.2k · out 3\.1k/);

  const replCtxState = createReplDisplayState({
    mode: "edit",
    model: "deepseek",
    cwd: "/tmp/project",
  });
  handleReplDisplayEvent(
    replCtxState,
    mockEvent("model.request", {
      step: 2,
      maxSteps: 8,
      messageCount: 12,
      contextTokens: 12_400,
      maxContextTokens: 128_000,
    }),
  );
  assert.match(renderReplStatusBar(replCtxState), /ctx: 12\.4k\/128\.0k \(10%\)/);

  const tuiCtxState = createTuiState({ cwd: "/tmp/project", model: "deepseek", mode: "edit" });
  applyTuiEvent(
    tuiCtxState,
    mockEvent("model.request", {
      step: 3,
      maxSteps: 10,
      messageCount: 8,
      contextTokens: 9_500,
      maxContextTokens: 128_000,
    }),
  );
  assert.match(statusLine(tuiCtxState), /ctx 9\.5k\/128\.0k \(7%\)/);

  await runMockDisplayScenarios();
}
