import type { AgentEvent, ToolCall } from "@code-mind/shared";
import type { DisplayLevel } from "../display-level.js";
import { showsTraceDetail } from "../display-level.js";
import { theme } from "../theme.js";
import { describeToolIntent } from "./tool-intent.js";
import { ActivityPane, DEFAULT_ACTIVITY_PANE_HEIGHT, type ActivityEntry } from "./activity-pane.js";
import { formatToolCallLine, formatToolCallLineFromResult } from "./tool-call-line.js";

const NARRATIVE_MAX = 200;
const CONCLUSION_PREFIX = "结论：";

export interface FoldedStep {
  step: number;
  toolCount: number;
  narrative?: string;
  entries: ActivityEntry[];
}

export interface StepJournalOptions {
  level: DisplayLevel;
  stream?: NodeJS.WriteStream;
  paneHeight?: number;
  paneWidth?: number;
  /** When true, TTY viewport redraw is handled by the caller. */
  tty?: boolean;
}

export interface StepJournalOutput {
  /** Lines to append permanently to stderr. */
  lines: string[];
  /** Activity pane snapshot for in-place TTY redraw (if any). */
  paneLines?: string[];
  /** Whether caller should redraw pane in place. */
  redrawPane?: boolean;
}

function payloadToolCall(payload: Record<string, unknown>): ToolCall | undefined {
  const raw = payload.toolCall;
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
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

function payloadToolCalls(payload: Record<string, unknown>, key: string): ToolCall[] {
  const value = payload[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is ToolCall => {
    return (
      typeof item === "object" &&
      item !== null &&
      typeof (item as ToolCall).id === "string" &&
      typeof (item as ToolCall).name === "string"
    );
  });
}

function truncateNarrative(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= NARRATIVE_MAX) {
    return trimmed;
  }
  return `${trimmed.slice(0, NARRATIVE_MAX - 1)}…`;
}

function synthesizeNarrative(planned: ToolCall[]): string {
  if (planned.length === 0) {
    return "我将继续分析当前任务。";
  }
  const intents = planned.slice(0, 3).map((call) => describeToolIntent(call));
  if (planned.length === 1) {
    return intents[0] ?? "我将调用工具继续任务。";
  }
  const rest = planned.length > 3 ? ` 等 ${planned.length} 项操作` : "";
  return `我将${intents.map((line) => line.replace(/^[A-Z]/, (c) => c.toLowerCase())).join("，")}${rest}。`;
}

function formatNarrative(text: string): string {
  return truncateNarrative(text);
}

function formatConclusion(text: string): string {
  const body = truncateNarrative(text);
  return body.startsWith(CONCLUSION_PREFIX) ? body : `${CONCLUSION_PREFIX}${body}`;
}

function foldLine(step: number, toolCount: number): string {
  return `▸ Step ${step} · ${toolCount} tool${toolCount === 1 ? "" : "s"}`;
}

export class StepJournalRenderer {
  private readonly level: DisplayLevel;
  private readonly stream: NodeJS.WriteStream | undefined;
  private readonly tty: boolean;
  private pane: ActivityPane;
  private currentStep = 0;
  private currentNarrative: string | undefined;
  private paneCommitted = false;
  private reasoningLength = 0;
  private readonly foldedSteps: FoldedStep[] = [];
  private lastShellOutput: string | undefined;

  constructor(options: StepJournalOptions) {
    this.level = options.level;
    this.stream = options.stream;
    this.tty = options.tty ?? false;
    const width =
      options.paneWidth ??
      (typeof process.stderr.columns === "number" ? process.stderr.columns : 72);
    this.pane = new ActivityPane({
      height: options.paneHeight ?? DEFAULT_ACTIVITY_PANE_HEIGHT,
      width,
    });
  }

  getLastShellOutput(): string | undefined {
    return this.lastShellOutput;
  }

  getFoldedSteps(): readonly FoldedStep[] {
    return this.foldedSteps;
  }

  /** Expand the most recently folded step; returns lines to print. */
  expandLastFoldedStep(): string[] {
    const last = this.foldedSteps.pop();
    if (!last) {
      return [];
    }
    const lines: string[] = [];
    if (last.narrative) {
      lines.push(last.narrative);
    }
    const replay = new ActivityPane({ height: this.pane.height, width: this.pane.width });
    for (const entry of last.entries) {
      replay.appendRawLine(entry.text, entry.status);
    }
    lines.push(...replay.render({ viewport: false }));
    return lines;
  }

  handleEvent(event: AgentEvent): StepJournalOutput {
    const p = event.payload;
    const out: StepJournalOutput = { lines: [] };

    switch (event.kind) {
      case "step.started": {
        const step = typeof p.step === "number" ? p.step : 0;
        this.flushCurrentStep(out, { fold: this.pane.entryCount > 0 });
        this.currentStep = step;
        this.currentNarrative = undefined;
        this.paneCommitted = false;
        this.reasoningLength = 0;
        this.pane = this.pane.cloneEmpty();
        break;
      }
      case "model.request":
        this.pane.setThinking(true);
        out.redrawPane = this.tty && this.paneCommitted;
        out.paneLines = this.renderPaneLines();
        break;
      case "model.reasoning.delta":
        if (showsTraceDetail(this.level)) {
          this.reasoningLength =
            typeof p.totalLength === "number" ? p.totalLength : this.reasoningLength;
          this.pane.setReasoning(this.reasoningLength);
          out.redrawPane = this.tty && this.paneCommitted;
          out.paneLines = this.renderPaneLines();
        } else if (typeof p.totalLength === "number") {
          this.reasoningLength = p.totalLength;
          this.pane.setReasoning(this.reasoningLength);
          out.redrawPane = this.tty && this.paneCommitted;
          out.paneLines = this.renderPaneLines();
        }
        break;
      case "model.response": {
        this.pane.setThinking(false);
        const toolCallCount = typeof p.toolCallCount === "number" ? p.toolCallCount : 0;
        const textPreview = typeof p.textPreview === "string" ? p.textPreview.trim() : "";

        if (toolCallCount > 0) {
          const planned = payloadToolCalls(p, "plannedToolCalls");
          this.currentNarrative =
            textPreview.length > 0
              ? formatNarrative(textPreview)
              : formatNarrative(synthesizeNarrative(planned));
          out.lines.push(this.currentNarrative);
          for (const call of planned) {
            this.pane.appendPendingTool(call);
          }
          this.commitPane(out);
        } else if (textPreview.length > 0) {
          if (this.pane.entryCount > 0) {
            this.commitPane(out);
            this.foldCurrentPane(out);
          }
          out.lines.push(formatConclusion(textPreview));
          out.lines.push("");
        }
        break;
      }
      case "tool.call": {
        const call = payloadToolCall(p);
        if (call) {
          this.pane.appendPendingTool(call);
          if (!this.paneCommitted && this.currentNarrative) {
            out.lines.push(this.currentNarrative);
            this.currentNarrative = undefined;
          }
          this.commitPane(out);
          out.redrawPane = this.tty;
          out.paneLines = this.renderPaneLines();
        }
        break;
      }
      case "tool.result": {
        this.pane.updateToolResult(p);
        const output =
          typeof p.outputPreview === "string"
            ? p.outputPreview
            : typeof p.output === "string"
              ? p.output
              : undefined;
        const call = payloadToolCall(p);
        if (call?.name === "run_shell" && output) {
          this.lastShellOutput = output;
        }
        if (!this.tty && this.paneCommitted) {
          const line = formatToolCallLineFromResult(p);
          if (line) {
            out.lines.push(`  ${line}`);
          }
        } else {
          out.redrawPane = this.tty && this.paneCommitted;
          out.paneLines = this.renderPaneLines();
        }
        break;
      }
      case "verification.finished": {
        const passed = p.passed === true;
        const summary = typeof p.summary === "string" ? p.summary : "";
        this.pane.appendVerifyLine(passed, summary);
        if (this.paneCommitted) {
          out.redrawPane = this.tty;
          out.paneLines = this.renderPaneLines();
        } else {
          this.commitPane(out);
        }
        break;
      }
      case "context.compacted": {
        const compactionCount = typeof p.compactionCount === "number" ? p.compactionCount : 0;
        const messageCount = typeof p.messageCount === "number" ? p.messageCount : 0;
        this.pane.appendCompactLine(compactionCount, messageCount);
        if (this.paneCommitted) {
          out.redrawPane = this.tty;
          out.paneLines = this.renderPaneLines();
        } else {
          this.commitPane(out);
        }
        break;
      }
      case "turn.finished":
        this.flushCurrentStep(out, { fold: false });
        break;
      default:
        break;
    }

    return out;
  }

  /** Final flush at end of turn — expose any open pane without folding. */
  flush(out: StepJournalOutput): void {
    this.flushCurrentStep(out, { fold: false });
  }

  private flushCurrentStep(out: StepJournalOutput, options: { fold: boolean }): void {
    if (this.pane.entryCount === 0) {
      return;
    }
    if (!this.paneCommitted) {
      if (this.currentNarrative) {
        out.lines.push(this.currentNarrative);
        this.currentNarrative = undefined;
      }
      this.commitPane(out);
    }
    if (options.fold) {
      this.foldCurrentPane(out);
    }
  }

  private foldCurrentPane(out: StepJournalOutput): void {
    if (this.pane.entryCount === 0) {
      return;
    }
    const toolCount = this.pane.getEntries().filter((entry) => entry.kind === "tool").length;
    this.foldedSteps.push({
      step: this.currentStep,
      toolCount,
      ...(this.currentNarrative === undefined ? {} : { narrative: this.currentNarrative }),
      entries: this.pane.snapshot(),
    });
    out.lines.push(theme.dim(foldLine(this.currentStep, toolCount), this.stream));
    out.lines.push("");
    this.pane.clear();
    this.paneCommitted = false;
    this.currentNarrative = undefined;
  }

  private commitPane(out: StepJournalOutput): void {
    if (this.pane.entryCount === 0) {
      return;
    }
    if (!this.paneCommitted) {
      out.lines.push(...this.renderPaneLines(!this.tty));
      out.lines.push("");
      out.paneLines = this.renderPaneLines();
      out.redrawPane = false;
      this.paneCommitted = true;
    }
  }

  private renderPaneLines(fullLog = false): string[] {
    return this.pane.render({
      viewport: !fullLog && this.tty,
      bordered: this.tty,
    });
  }
}
