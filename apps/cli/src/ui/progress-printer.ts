import type { AgentResult, AgentEvent, UserTask, ActivityKind, ToolCall } from "@code-mind/shared";
import { getEffectiveResultStatus } from "@code-mind/core";
import type { DisplayLevel, DisplayMode, DisplayOptions } from "./display-level.js";
import { resolveDisplayMode, showsDebugEventStream, showsTraceDetail } from "./display-level.js";
import { displayWidth, truncateToWidth } from "./text-wrap.js";
import { colorNarrativeLine, colorThinkingPreview } from "./journal-theme.js";
import {
  renderApprovalBlock,
  type ApprovalPromptStyle,
  renderModelTraceLine,
  renderRunHeader,
} from "./agent-output/blocks.js";
import { formatToolBlockFromPayload } from "./agent-output/tool-blocks.js";
import { describeToolIntent } from "./agent-output/tool-intent.js";
import { StepJournalRenderer, type StepJournalOutput } from "./agent-output/step-journal.js";
import { renderToolFailureBlock } from "./agent-output/error-blocks.js";
import { formatTokenUsageSummary } from "./format.js";
import { renderAgentEventLine, isCliInternalEvent } from "./event-lines.js";
import { hr, shortPath, theme } from "./theme.js";
import { renderChangedFiles } from "./render.js";
import { formatFinalText } from "./final-text.js";
import {
  buildStructuredRunResult,
  renderFollowUpCommands,
  renderNextSection,
  renderResultFooterLines,
  renderTurnFinishedLine,
} from "./result-summary.js";
import type { TerminalComposer } from "./terminal-composer.js";
import {
  createReplDisplayState,
  handleReplDisplayEvent,
  renderReplAssistantBrief,
  renderReplStatusBar,
  type ReplDisplayState,
} from "./repl/repl-display.js";

function toolCallFromPayload(p: Record<string, unknown>): ToolCall {
  const raw = p.toolCall;
  if (typeof raw === "object" && raw !== null) {
    const record = raw as Record<string, unknown>;
    return {
      id: String(record.id ?? ""),
      name: String(record.name ?? "unknown"),
      arguments:
        typeof record.arguments === "object" && record.arguments !== null
          ? (record.arguments as Record<string, unknown>)
          : {},
    };
  }
  return { id: "", name: "unknown", arguments: {} };
}

interface StatusState {
  step: number;
  maxSteps: number;
  activity: ActivityKind;
  activityDetail?: string;
  modelName: string;
  lastStepIntent?: string;
}

export interface HeaderDetails {
  cliVersion?: string;
  workspaceRoot?: string;
  gitSummary?: string;
  modelProvider?: string;
  configuredModelName?: string;
  toolCount?: number;
  mcpServerCount?: number;
  configLines?: string[];
  detectedLines?: string[];
  rootHint?: string;
  sandboxMode?: string;
  approvalMode?: string;
  networkMode?: string;
}

export interface ReplDisplayContext {
  mode: string;
  model: string;
  cwd: string;
  gitSummary?: string;
}

export interface ProgressPrinterOptions {
  level: DisplayMode;
  /** When "repl", level 0–1 use lightweight conversation-first output instead of Journal v3. */
  surface?: "run" | "repl";
  replContext?: ReplDisplayContext;
  stream?: NodeJS.WriteStream;
  /** stdout target for streamed model content (REPL / final answers). */
  contentStream?: NodeJS.WriteStream;
  approvalPromptStyle?: ApprovalPromptStyle;
  /** TTY run/REPL with user input — never use \\r / cursor-up redraws on stderr. */
  interactiveTerminal?: boolean;
  /** Pins user input to the bottom row while progress scrolls above. */
  terminalComposer?: TerminalComposer;
}

function renderErrorGuidance(result: AgentResult): string[] {
  const status = getEffectiveResultStatus(result);
  if (status === "success") {
    return [];
  }

  const lines = ["Failure", `  Status: ${status}`];
  if (result.status !== status) {
    lines.push(`  Termination: ${result.status}`);
  }
  if (typeof result.metadata?.rejectionSource === "string") {
    lines.push(`  Source: ${result.metadata.rejectionSource}`);
  }
  const verification = result.metadata?.verification as { summary?: unknown } | undefined;
  if (typeof verification?.summary === "string" && verification.summary.length > 0) {
    lines.push(`  Verification: ${verification.summary}`);
  }
  lines.push("  Next: inspect the session summary and rerun with a narrower target if needed.");
  lines.push("");
  return lines;
}

function usesJournalV3(level: DisplayMode): level is DisplayLevel {
  return typeof level === "number";
}

export class ProgressPrinter {
  private readonly stream: NodeJS.WriteStream;
  private readonly contentStream: NodeJS.WriteStream;
  private started = false;
  private streamContentActive = false;
  private streamedStdoutContent = false;
  private paneLineCount = 0;
  private previewLineActive = false;
  private previewRowCount = 0;
  private journal: StepJournalRenderer | undefined;
  private replState: ReplDisplayState | undefined;
  private replStatusLineActive = false;
  /** Blocks \\r in-place preview, pane redraw, and REPL status bar updates. */
  private inputPaused = false;
  /** REPL: keep stderr on new lines while readline may be active at the prompt. */
  private suppressInPlace = false;
  private readonly terminalComposer: TerminalComposer | undefined;
  private readonly state: StatusState = {
    step: 0,
    maxSteps: 0,
    activity: "thinking",
    modelName: "",
  };

  constructor(private readonly options: ProgressPrinterOptions) {
    this.stream = options.stream ?? process.stderr;
    this.contentStream = options.contentStream ?? process.stdout;
    this.terminalComposer = options.terminalComposer;
    const level = options.level;
    if (this.usesReplDisplay()) {
      const ctx = options.replContext;
      this.replState = createReplDisplayState({
        mode: ctx?.mode ?? "agent",
        model: ctx?.model ?? "default",
        cwd: ctx?.cwd ?? process.cwd(),
        ...(ctx?.gitSummary === undefined ? {} : { gitSummary: ctx.gitSummary }),
      });
    } else if (usesJournalV3(level)) {
      this.journal = new StepJournalRenderer({
        level,
        stream: this.stream,
        tty: this.stream.isTTY,
        flatActivityLog: options.interactiveTerminal === true,
      });
    }
    if (options.interactiveTerminal) {
      this.suppressInPlace = true;
    }
  }

  private usesReplDisplay(): boolean {
    if (this.options.surface !== "repl") {
      return false;
    }
    const level = this.options.level;
    return usesJournalV3(level) && (level as DisplayLevel) <= 1;
  }

  getReplDisplayState(): ReplDisplayState | undefined {
    return this.replState;
  }

  get level(): DisplayMode {
    return this.options.level;
  }

  hasStreamedContent(): boolean {
    return this.streamedStdoutContent;
  }

  getLastShellOutput(): string | undefined {
    return this.journal?.getLastShellOutput();
  }

  expandLastFoldedStep(): string[] {
    return this.journal?.expandLastFoldedStep() ?? [];
  }

  /** Finalize in-place stderr output before readline takes the terminal. */
  pauseForInput(): void {
    if (this.inputPaused) {
      return;
    }
    this.finalizeInPlaceOutput();
    this.paneLineCount = 0;
    this.inputPaused = true;
  }

  resumeAfterInput(): void {
    this.inputPaused = false;
    this.previewLineActive = false;
    this.previewRowCount = 0;
    this.replStatusLineActive = false;
  }

  /** REPL: avoid \\r updates while the › prompt may be accepting input. */
  setSuppressInPlace(value: boolean): void {
    if (value === this.suppressInPlace) {
      return;
    }
    if (value) {
      this.finalizeInPlaceOutput();
    }
    this.suppressInPlace = value;
  }

  printHeader(
    task: string,
    mode: string,
    cwd: string,
    details: HeaderDetails = {},
  ): void {
    if (this.started) {
      return;
    }
    this.started = true;

    if (this.usesReplDisplay()) {
      return;
    }

    if (this.options.level === "json") {
      return;
    }

    if (this.options.level === "jsonl") {
      this.writeJsonLine({
        type: "header",
        task,
        mode,
        cwd,
        ...details,
      });
      return;
    }

    const level = this.options.level as DisplayLevel;
    const headerLevel = level <= 1 ? (1 as DisplayLevel) : level;
    const headerOptions: Parameters<typeof renderRunHeader>[0] = {
      task,
      mode,
      cwd,
      level: headerLevel,
      stream: this.stream,
      ...details,
    };
    if (this.state.modelName) {
      headerOptions.modelName = this.state.modelName;
    }
    const lines = renderRunHeader(headerOptions);
    this.writeLines(lines);
  }

  onEvent = async (event: AgentEvent): Promise<void> => {
    if (this.options.level === "json") {
      return;
    }

    if (this.options.level === "jsonl") {
      this.writeJsonLine(event);
      return;
    }

    const level = this.options.level as DisplayLevel;

    const debugStream = showsDebugEventStream(level);
    const traceOnly = level >= 2 && this.isTraceOnlyEvent(event);

    if (debugStream || traceOnly) {
      if (!isCliInternalEvent(event.kind)) {
        const line = renderAgentEventLine(event, {
          verbose: level >= 2,
          trace: showsTraceDetail(level) || debugStream,
        });
        if (line) {
          this.emit(`${theme.dim(`  ${line}`, this.stream)}\n`, this.stream);
          if (debugStream) {
            return;
          }
        }
      }
    }

    this.handleAgentOutput(event, level);
  };

  renderResult(task: UserTask, result: AgentResult): string {
    if (this.options.level === "json") {
      return `${JSON.stringify(buildStructuredRunResult(task, result), null, 2)}\n`;
    }

    if (this.options.level === "jsonl") {
      return `${JSON.stringify({
        type: "result",
        ...buildStructuredRunResult(task, result),
      })}\n`;
    }

    const level = this.options.level as DisplayLevel;
    const body = formatFinalText(result.summary ?? result.finalText, {
      level,
      stream: this.stream,
    });

    if (level === 0) {
      return this.streamedStdoutContent ? "\n" : `${body}\n`;
    }

    const lines = [
      ...(this.streamedStdoutContent ? [] : [body]),
      ...renderResultFooterLines(task, result, level, this.stream),
    ];
    const changedFiles = renderChangedFiles(result);
    if (changedFiles.length > 0) {
      lines.push(...changedFiles);
    }
    const errorGuidance = renderErrorGuidance(result);
    if (errorGuidance.length > 0) {
      lines.push(...errorGuidance);
    }
    lines.push(...renderNextSection(result, task));
    lines.push(...renderFollowUpCommands(result), "");

    if (level >= 2) {
      lines.splice(
        lines.length - 1,
        0,
        hr(),
        theme.dim(`run ${result.runId}`),
        theme.dim(`.agent/runs/${result.runId}/events.jsonl`),
        theme.dim(result.sessionId),
        theme.dim(shortPath(task.cwd)),
      );
      if (result.metadata?.tokenUsage && typeof result.metadata.tokenUsage === "object") {
        lines.splice(
          lines.length - 1,
          0,
          theme.dim(
            formatTokenUsageSummary(
              result.metadata.tokenUsage as import("@code-mind/shared").TokenUsage,
            ),
          ),
        );
      }
      lines.splice(
        lines.length - 1,
        0,
        theme.dim(
          `activity: ${String(result.metadata?.activitySummary?.last ?? "unknown")}`,
        ),
      );
    }

    return `${lines.join("\n")}\n`;
  }

  dispose(): void {
    this.paneLineCount = 0;
  }

  private isTraceOnlyEvent(event: AgentEvent): boolean {
    return (
      event.kind === "model.request" ||
      event.kind === "tool.call" ||
      event.kind === "activity.updated" ||
      event.kind === "turn.started"
    );
  }

  private handleAgentOutput(event: AgentEvent, level: DisplayLevel): void {
    const p = event.payload;
    const journalMode = usesJournalV3(this.options.level) && this.journal !== undefined;

    switch (event.kind) {
      case "turn.started": {
        const name = typeof p.modelName === "string" ? p.modelName : "";
        this.state.modelName = name;
        break;
      }
      case "activity.updated":
        if (typeof p.activity === "string") {
          this.state.activity = p.activity as ActivityKind;
        }
        if (p.detail !== undefined && typeof p.detail === "string") {
          this.state.activityDetail = p.detail;
        } else {
          delete this.state.activityDetail;
        }
        break;
      case "subagent.spawned": {
        const agentName = typeof p.agentName === "string" ? p.agentName : "subagent";
        const task = typeof p.task === "string" ? p.task : "";
        this.state.activity = "delegating";
        this.state.activityDetail = `${agentName} · ${task.slice(0, 80)}`;
        break;
      }
      case "subagent.finished":
        if (p.success === true) {
          this.state.activity = "reading";
        }
        break;
      case "closing_turn.started":
        this.state.activity = "summarizing";
        break;
      case "step.started": {
        const step = typeof p.step === "number" ? p.step : 0;
        const maxSteps = typeof p.maxSteps === "number" ? p.maxSteps : 0;
        this.state.step = step;
        this.state.maxSteps = maxSteps;
        break;
      }
      case "model.request": {
        const step = typeof p.step === "number" ? p.step : 0;
        const maxSteps = typeof p.maxSteps === "number" ? p.maxSteps : 0;
        this.state.step = step;
        this.state.maxSteps = maxSteps;
        this.streamContentActive = p.streamContent === true;
        break;
      }
      case "model.content.delta": {
        if (!this.streamContentActive) {
          break;
        }
        const delta = typeof p.delta === "string" ? p.delta : "";
        if (delta.length > 0) {
          this.emit(delta, this.contentStream);
          this.streamedStdoutContent = true;
        }
        break;
      }
      case "model.response": {
        this.streamContentActive = false;
        if (this.streamedStdoutContent) {
          this.emit("\n", this.contentStream);
        }
        const toolCallCount = typeof p.toolCallCount === "number" ? p.toolCallCount : 0;
        const textPreview = typeof p.textPreview === "string" ? p.textPreview : "";
        if (toolCallCount === 0) {
          this.state.activity = "summarizing";
        } else if (textPreview.trim()) {
          this.state.lastStepIntent = textPreview.trim();
        }
        if (level >= 2 && showsTraceDetail(level)) {
          const trace = renderModelTraceLine(event);
          if (trace) {
            this.writeLine(theme.dim(trace, this.stream));
          }
        }
        break;
      }
      case "tool.result":
        if (!this.usesReplDisplay()) {
          if (level >= 2) {
            for (const line of formatToolBlockFromPayload(p, { level, stream: this.stream })) {
              this.writeLine(line);
            }
          } else if (level >= 1 && p.success !== true) {
            const failure = renderToolFailureBlock(p, { level, stream: this.stream });
            for (const line of failure) {
              this.writeLine(line);
            }
          }
        }
        break;
      case "approval.requested":
        this.pauseForInput();
        this.terminalComposer?.install();
        this.writeLines(
          renderApprovalBlock(event, this.stream, this.options.approvalPromptStyle ?? "display", {
            ...(this.state.lastStepIntent === undefined ? {} : { stepIntent: this.state.lastStepIntent }),
            toolIntent: describeToolIntent(toolCallFromPayload(p)),
          }),
        );
        break;
      case "approval.resolved":
        this.resumeAfterInput();
        break;
      case "turn.finished":
        if (level <= 1 && !this.usesReplDisplay()) {
          this.writeLine(renderTurnFinishedLine(event));
        }
        break;
      default:
        break;
    }

    if (this.usesReplDisplay() && this.replState !== undefined) {
      const replOutput = handleReplDisplayEvent(this.replState, event);
      if (replOutput.statusBar) {
        this.writeReplStatusBar();
      }
      if (replOutput.lines.length > 0) {
        this.replStatusLineActive = false;
        this.writeLines(replOutput.lines);
      }
      if (event.kind === "model.response") {
        const brief = renderReplAssistantBrief(this.replState, this.stream);
        if (brief.length > 0) {
          this.writeLines(brief);
        }
      }
      return;
    }

    if (!journalMode || this.journal === undefined) {
      return;
    }

    if (
      event.kind === "model.response" ||
      event.kind === "model.request" ||
      event.kind === "model.content.delta" ||
      event.kind === "model.reasoning.delta" ||
      event.kind === "step.started" ||
      event.kind === "tool.call" ||
      event.kind === "tool.result" ||
      event.kind === "verification.finished" ||
      event.kind === "context.compacted" ||
      event.kind === "turn.finished"
    ) {
      const output = this.journal.handleEvent(event);
      this.applyJournalOutput(output);
    }
  }

  private applyJournalOutput(output: StepJournalOutput): void {
    if (output.finalizeLines && output.finalizeLines.length > 0) {
      this.finalizePreviewWithLines(output.finalizeLines);
    } else {
      if (output.clearPreviewLine) {
        this.clearPreviewLine();
      }
      if (output.previewLine && !this.inputPaused) {
        this.writePreviewLine(output.previewLine);
      }
    }
    if (output.lines.length > 0) {
      this.writeLines(output.lines);
      if (output.paneLines && output.paneLines.length > 0) {
        this.paneLineCount = output.paneLines.length;
      } else if (!output.redrawPane) {
        this.paneLineCount = 0;
      }
    }
    if (
      output.redrawPane &&
      output.paneLines &&
      output.paneLines.length > 0 &&
      this.canUseInPlaceUpdates()
    ) {
      this.redrawPaneInPlace(output.paneLines);
    } else if (output.redrawPane && output.paneLines && output.paneLines.length > 0) {
      this.writeLines(output.paneLines);
      this.paneLineCount = output.paneLines.length;
    }
  }

  private canUseInPlaceUpdates(): boolean {
    return !this.inputPaused && !this.suppressInPlace && this.stream.isTTY;
  }

  private finalizeInPlaceOutput(): void {
    this.clearPreviewLine();
    this.finalizeReplStatusBar();
  }

  private finalizeReplStatusBar(): void {
    if (!this.replStatusLineActive || !this.stream.isTTY) {
      this.replStatusLineActive = false;
      return;
    }
    this.stream.write("\n");
    this.replStatusLineActive = false;
  }

  private finalizePreviewWithLines(lines: string[]): void {
    if (!this.stream.isTTY || !this.canUseInPlaceUpdates()) {
      this.previewLineActive = false;
      this.previewRowCount = 0;
      this.writeLines(lines.map((line) => colorNarrativeLine(line, this.stream)));
      return;
    }
    if (this.previewLineActive) {
      this.moveToPreviewStart();
      this.stream.write("\x1b[2K");
      this.previewLineActive = false;
      this.previewRowCount = 0;
    }
    this.writeLines(lines.map((line) => colorNarrativeLine(line, this.stream)));
  }

  private clearPreviewLine(): void {
    if (!this.previewLineActive || !this.stream.isTTY) {
      return;
    }
    this.moveToPreviewStart();
    this.stream.write("\x1b[2K\n");
    this.previewLineActive = false;
    this.previewRowCount = 0;
  }

  private moveToPreviewStart(): void {
    for (let index = 0; index < this.previewRowCount - 1; index += 1) {
      this.stream.write("\x1b[1A");
    }
    this.stream.write("\r");
  }

  private estimatePreviewRows(line: string, columns: number): number {
    const width = Math.max(1, columns);
    return Math.max(1, Math.ceil(displayWidth(line) / width));
  }

  private writePreviewLine(line: string): void {
    if (!this.canUseInPlaceUpdates()) {
      return;
    }
    const columns = this.stream.columns ?? 80;
    const fitted = truncateToWidth(line, columns);
    const colored = colorThinkingPreview(fitted, this.stream);

    if (this.previewLineActive) {
      this.moveToPreviewStart();
      this.stream.write(`\x1b[2K${colored}`);
    } else {
      this.stream.write(`\r\x1b[2K${colored}`);
    }
    this.previewLineActive = true;
    this.previewRowCount = this.estimatePreviewRows(fitted, columns);
  }

  private redrawPaneInPlace(lines: string[]): void {
    if (!this.canUseInPlaceUpdates()) {
      return;
    }
    const previousLineCount = this.paneLineCount;
    if (previousLineCount > 0) {
      this.stream.write(`\x1b[${previousLineCount}A`);
    }
    const rowsToWrite = Math.max(previousLineCount, lines.length);
    for (let index = 0; index < rowsToWrite; index += 1) {
      this.stream.write(`\x1b[2K${lines[index] ?? ""}\n`);
    }
    if (rowsToWrite > lines.length) {
      this.stream.write(`\x1b[${rowsToWrite - lines.length}A`);
    }
    this.paneLineCount = lines.length;
  }

  private emit(text: string, _target: NodeJS.WriteStream = this.stream): void {
    if (this.terminalComposer?.isPinned()) {
      this.terminalComposer.writeAbove(text);
      return;
    }
    _target.write(text);
  }

  private writeLine(text: string): void {
    this.emit(`${text}\n`);
  }

  private writeJsonLine(value: unknown): void {
    this.emit(`${JSON.stringify(value)}\n`);
  }

  private writeLines(lines: string[]): void {
    if (lines.length === 0) {
      return;
    }
    this.emit(`${lines.join("\n")}\n`);
  }

  private writeReplStatusBar(): void {
    if (this.replState === undefined) {
      return;
    }
    const line = renderReplStatusBar(this.replState, this.stream);
    if (this.canUseInPlaceUpdates() && this.replStatusLineActive) {
      this.emit(`\r\x1b[2K${line}`, this.stream);
    } else {
      this.emit(`${line}\n`, this.stream);
      this.replStatusLineActive = this.canUseInPlaceUpdates();
    }
  }
}

export function createProgressPrinter(
  options: DisplayOptions & { terminalComposer?: TerminalComposer } = {},
): ProgressPrinter {
  const level = resolveDisplayMode(options);
  return new ProgressPrinter({
    level,
    ...(options.approvalPromptStyle === undefined
      ? {}
      : { approvalPromptStyle: options.approvalPromptStyle }),
    ...(options.interactiveTerminal === undefined
      ? {}
      : { interactiveTerminal: options.interactiveTerminal }),
    ...(options.terminalComposer === undefined
      ? {}
      : { terminalComposer: options.terminalComposer }),
  });
}
