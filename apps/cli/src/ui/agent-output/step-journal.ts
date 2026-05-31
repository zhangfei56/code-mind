import type { AgentEvent, ToolCall } from "@code-mind/shared";
import { containsDsmlMarkup, stripDsmlToolCallMarkup } from "@code-mind/models";
import type { DisplayLevel } from "../display-level.js";
import { showsTraceDetail } from "../display-level.js";
import { resolveTerminalWidth, wrapText, truncateToWidth, displayWidth } from "../text-wrap.js";
import {
  colorActivityLine,
  colorFoldLine,
  colorNarrativeLine,
} from "../journal-theme.js";
import { describeToolIntent } from "./tool-intent.js";
import { ActivityPane, DEFAULT_ACTIVITY_PANE_HEIGHT, type ActivityEntry } from "./activity-pane.js";
import { formatToolCallLine, formatToolCallLineFromResult } from "./tool-call-line.js";

const NARRATIVE_MAX = 200;

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
  /** Append flat tool lines instead of bordered activity panes (pinned-input TTY). */
  flatActivityLog?: boolean;
}

export interface StepJournalOutput {
  /** Lines to append permanently to stderr. */
  lines: string[];
  /** Activity pane snapshot for in-place TTY redraw (if any). */
  paneLines?: string[];
  /** Whether caller should redraw pane in place. */
  redrawPane?: boolean;
  /** Single-line thinking preview for in-place TTY update (no border). */
  previewLine?: string;
  /** Clear the transient preview line before writing permanent output. */
  clearPreviewLine?: boolean;
  /** Replace preview with permanent narrative lines (TTY). */
  finalizeLines?: string[];
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

function formatNarrativeLines(text: string, stream?: NodeJS.WriteStream): string[] {
  const width = resolveTerminalWidth(stream);
  return wrapText(formatNarrative(text), width).map((line) => colorNarrativeLine(line, stream));
}

function sanitizeModelText(text: string): string {
  return stripDsmlToolCallMarkup(text);
}

function looksLikeDsmlOnly(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return true;
  }
  return containsDsmlMarkup(trimmed);
}

function resolveNarrativeSource(
  textPreview: string,
  contentPreview: string,
  reasoningPreview: string,
  planned: ToolCall[],
): string {
  for (const raw of [textPreview, contentPreview, reasoningPreview]) {
    const cleaned = sanitizeModelText(raw).trim();
    if (cleaned.length > 0 && !looksLikeDsmlOnly(cleaned)) {
      return cleaned;
    }
  }
  return synthesizeNarrative(planned);
}

function foldLine(step: number, toolCount: number): string {
  return `▸ Step ${step} · ${toolCount} tool${toolCount === 1 ? "" : "s"}`;
}

export class StepJournalRenderer {
  private readonly level: DisplayLevel;
  private readonly stream: NodeJS.WriteStream | undefined;
  private readonly tty: boolean;
  private readonly flatActivityLog: boolean;
  private pane: ActivityPane;
  private currentStep = 0;
  private currentNarrative: string | undefined;
  private paneCommitted = false;
  private reasoningLength = 0;
  private contentPreview = "";
  private reasoningPreview = "";
  private streamContentActive = false;
  private previewActive = false;
  private lastPreviewLine = "";
  private readonly foldedSteps: FoldedStep[] = [];
  private lastShellOutput: string | undefined;
  private emittedEntryText = new Map<string, string>();

  constructor(options: StepJournalOptions) {
    this.level = options.level;
    this.stream = options.stream;
    this.tty = options.tty ?? false;
    this.flatActivityLog = options.flatActivityLog ?? false;
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
        this.contentPreview = "";
        this.reasoningPreview = "";
        this.streamContentActive = false;
        this.previewActive = false;
        this.lastPreviewLine = "";
        this.emittedEntryText.clear();
        this.pane = this.pane.cloneEmpty();
        break;
      }
      case "model.request":
        this.streamContentActive = p.streamContent === true;
        this.pane.setThinking(true);
        if (!this.flatActivityLog) {
          out.redrawPane = this.tty && this.paneCommitted;
          out.paneLines = this.renderPaneLines();
        }
        break;
      case "model.content.delta": {
        if (this.streamContentActive) {
          break;
        }
        const delta = typeof p.delta === "string" ? p.delta : "";
        if (delta.length === 0) {
          break;
        }
        this.contentPreview = (this.contentPreview + delta).trimStart();
        if (containsDsmlMarkup(this.contentPreview)) {
          break;
        }
        const contentPreview = sanitizeModelText(this.contentPreview);
        this.pane.setThinkingPreview(contentPreview);
        this.emitThinkingPreview(out, contentPreview);
        break;
      }
      case "model.reasoning.delta": {
        const delta = typeof p.delta === "string" ? p.delta : "";
        if (showsTraceDetail(this.level)) {
          this.reasoningLength =
            typeof p.totalLength === "number" ? p.totalLength : this.reasoningLength;
          this.pane.setReasoning(this.reasoningLength);
          if (!this.flatActivityLog) {
            out.redrawPane = this.tty && this.paneCommitted;
            out.paneLines = this.renderPaneLines();
          }
        } else if (delta.length > 0 && this.contentPreview.length === 0) {
          this.reasoningPreview = (this.reasoningPreview + delta).trim();
          const reasoningPreview = sanitizeModelText(this.reasoningPreview);
          this.pane.setThinkingPreview(reasoningPreview);
          this.emitThinkingPreview(out, reasoningPreview);
        }
        break;
      }
      case "model.response": {
        this.streamContentActive = false;
        this.pane.setThinking(false);
        const toolCallCount = typeof p.toolCallCount === "number" ? p.toolCallCount : 0;
        const textPreview = typeof p.textPreview === "string" ? p.textPreview.trim() : "";

        if (toolCallCount > 0) {
          const planned = payloadToolCalls(p, "plannedToolCalls");
          const narrativeSource = resolveNarrativeSource(
            textPreview,
            this.contentPreview,
            this.reasoningPreview,
            planned,
          );
          this.currentNarrative = formatNarrative(narrativeSource);
          const narrativeLines = formatNarrativeLines(narrativeSource, this.stream);
          if (this.previewActive && this.tty) {
            out.finalizeLines = narrativeLines;
          } else {
            out.lines.push(...narrativeLines);
          }
          this.contentPreview = "";
          this.reasoningPreview = "";
          this.previewActive = false;
          this.lastPreviewLine = "";
          for (const call of planned) {
            this.pane.appendPendingTool(call);
          }
          this.commitPane(out);
        } else if (textPreview.length > 0) {
          this.contentPreview = "";
          this.reasoningPreview = "";
          if (this.pane.entryCount > 0) {
            this.commitPane(out);
            this.foldCurrentPane(out);
          }
        }
        break;
      }
      case "tool.call": {
        const call = payloadToolCall(p);
        if (call) {
          this.pane.appendPendingTool(call);
          if (!this.paneCommitted && this.currentNarrative) {
            out.lines.push(...formatNarrativeLines(this.currentNarrative, this.stream));
            this.currentNarrative = undefined;
          }
          this.commitPane(out);
          if (this.flatActivityLog) {
            this.emitFlatToolUpdate(out, call);
          } else {
            out.redrawPane = this.tty;
            out.paneLines = this.renderPaneLines();
          }
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
        if (this.flatActivityLog && this.paneCommitted) {
          this.emitFlatToolUpdate(out, call);
        } else if (!this.tty && this.paneCommitted) {
          const line = formatToolCallLineFromResult(p);
          if (line) {
            out.lines.push(`  ${line}`);
          }
        } else if (!this.flatActivityLog) {
          out.redrawPane = this.tty && this.paneCommitted;
          out.paneLines = this.renderPaneLines();
        }
        break;
      }
      case "verification.finished": {
        const passed = p.passed === true;
        const summary = typeof p.summary === "string" ? p.summary : "";
        this.pane.appendVerifyLine(passed, summary);
        if (this.flatActivityLog && this.paneCommitted) {
          this.emitFlatSystemUpdate(out);
        } else if (this.paneCommitted) {
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
        const strategy = typeof p.strategy === "string" ? p.strategy : "llm";
        const evictedMessages =
          typeof p.evictedMessageCount === "number" ? p.evictedMessageCount : 0;
        const evictedObservations =
          typeof p.evictedObservationCount === "number" ? p.evictedObservationCount : 0;
        const evictedBlocks = evictedMessages + evictedObservations;
        this.pane.appendCompactLine(
          compactionCount,
          messageCount,
          strategy,
          evictedBlocks > 0 ? evictedBlocks : undefined,
        );
        if (this.flatActivityLog && this.paneCommitted) {
          this.emitFlatSystemUpdate(out);
        } else if (this.paneCommitted) {
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
        out.lines.push(...formatNarrativeLines(this.currentNarrative, this.stream));
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
    if (toolCount > 0) {
      this.foldedSteps.push({
        step: this.currentStep,
        toolCount,
        ...(this.currentNarrative === undefined ? {} : { narrative: this.currentNarrative }),
        entries: this.pane.snapshot(),
      });
      out.lines.push(colorFoldLine(foldLine(this.currentStep, toolCount), this.stream));
      out.lines.push("");
    }
    this.pane.clear();
    this.paneCommitted = false;
    this.previewActive = false;
    this.currentNarrative = undefined;
  }

  private commitPane(out: StepJournalOutput): void {
    if (this.pane.entryCount === 0) {
      return;
    }
    if (!this.paneCommitted) {
      if (this.flatActivityLog) {
        this.emitAllFlatEntries(out);
      } else {
        out.lines.push(...this.renderPaneLines(!this.tty));
        out.lines.push("");
        out.paneLines = this.renderPaneLines();
      }
      out.redrawPane = false;
      this.paneCommitted = true;
    }
  }

  private flatEntryKey(entry: ActivityEntry): string {
    return entry.toolCallId ?? entry.id;
  }

  private formatFlatActivityLine(entry: ActivityEntry): string {
    const maxWidth = Math.max(1, resolveTerminalWidth(this.stream) - 2);
    const plain = truncateToWidth(entry.text, maxWidth);
    return `  ${colorActivityLine(plain, entry.status, this.stream)}`;
  }

  private emitFlatEntryIfNeeded(out: StepJournalOutput, entry: ActivityEntry): void {
    const key = this.flatEntryKey(entry);
    const last = this.emittedEntryText.get(key);
    if (last === entry.text) {
      return;
    }
    this.emittedEntryText.set(key, entry.text);
    out.lines.push(this.formatFlatActivityLine(entry));
  }

  private emitAllFlatEntries(out: StepJournalOutput): void {
    for (const entry of this.pane.getEntries()) {
      this.emitFlatEntryIfNeeded(out, entry);
    }
  }

  private emitFlatToolUpdate(out: StepJournalOutput, call: ToolCall | undefined): void {
    if (!call) {
      return;
    }
    const entry = this.pane.getEntries().find((item) => item.toolCallId === call.id);
    if (entry) {
      this.emitFlatEntryIfNeeded(out, entry);
    }
  }

  private emitFlatSystemUpdate(out: StepJournalOutput): void {
    const entry = this.pane.getEntries().at(-1);
    if (entry?.kind === "system") {
      this.emitFlatEntryIfNeeded(out, entry);
    }
  }

  private renderPaneLines(fullLog = false): string[] {
    return this.pane.render({
      viewport: !fullLog && this.tty,
      bordered: this.tty,
      ...(this.stream === undefined ? {} : { stream: this.stream }),
    });
  }

  private formatPreviewLine(text: string): string {
    const columns = resolveTerminalWidth(this.stream);
    const prefix = `  ${"thinking".padEnd(11)} `;
    const budget = Math.max(8, columns - displayWidth(prefix));
    const trimmed = text.trim();
    if (!trimmed) {
      return truncateToWidth(`${prefix}…`, columns);
    }
    const tailBudget = Math.min(36, budget - 1);
    let tail = trimmed;
    while (displayWidth(tail) > tailBudget && tail.length > 0) {
      tail = tail.slice(1);
    }
    if (tail.length === 0) {
      tail = truncateToWidth(trimmed, tailBudget);
    }
    const hint = tail.length < trimmed.length ? `…${tail}` : `${tail}…`;
    return truncateToWidth(`${prefix}${hint}`, columns);
  }

  private emitThinkingPreview(out: StepJournalOutput, text: string): void {
    if (!this.tty) {
      return;
    }
    const cleaned = sanitizeModelText(text).trim();
    if (!cleaned || looksLikeDsmlOnly(cleaned)) {
      return;
    }
    const line = this.formatPreviewLine(cleaned);
    if (line === this.lastPreviewLine) {
      return;
    }
    this.lastPreviewLine = line;
    out.previewLine = line;
    this.previewActive = true;
  }
}
