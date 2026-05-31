import type { ToolCall } from "@code-mind/shared";
import {
  formatSystemActivityLine,
  formatToolCallLine,
  formatToolCallLineFromResult,
  metaFromFinished,
  type ToolCallLineMeta,
  type ToolCallLineStatus,
} from "./tool-call-line.js";
import { toolPayloadToFinishedLike } from "./tool-blocks.js";
import { truncateToWidth } from "../text-wrap.js";
import {
  colorActivityBorder,
  colorActivityLine,
} from "../journal-theme.js";

export const DEFAULT_ACTIVITY_PANE_HEIGHT = 8;

export type ActivityEntryKind = "tool" | "system";

export interface ActivityEntry {
  id: string;
  kind: ActivityEntryKind;
  text: string;
  status: ToolCallLineStatus;
  toolCallId?: string;
}

export interface ActivityPaneOptions {
  height?: number;
  width?: number;
}

function horizontalRule(width: number): string {
  return `─`.repeat(Math.max(20, width - 2));
}

function padPaneLine(content: string, width: number): string {
  const innerWidth = Math.max(1, width - 4);
  const fitted = truncateToWidth(content, innerWidth);
  if (fitted.length >= innerWidth) {
    return `│ ${fitted}`;
  }
  return `│ ${fitted.padEnd(innerWidth)}`;
}

function fitEntryText(text: string, width: number, bordered: boolean): string {
  const maxWidth = bordered ? Math.max(1, width - 4) : Math.max(1, width - 2);
  return truncateToWidth(text, maxWidth);
}

export class ActivityPane {
  private entries: ActivityEntry[] = [];
  private nextId = 0;
  readonly height: number;
  readonly width: number;

  constructor(options: ActivityPaneOptions = {}) {
    this.height = options.height ?? DEFAULT_ACTIVITY_PANE_HEIGHT;
    this.width = options.width ?? 72;
  }

  get entryCount(): number {
    return this.entries.length;
  }

  cloneEmpty(): ActivityPane {
    return new ActivityPane({ height: this.height, width: this.width });
  }

  getEntries(): readonly ActivityEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries = [];
  }

  setThinking(pending: boolean): void {
    this.removeSystemEntry("thinking");
    if (pending) {
      this.appendSystem("thinking", "thinking…", "pending");
    }
  }

  setThinkingPreview(detail: string): void {
    this.removeSystemEntry("thinking");
    const preview = detail.trim();
    const maxPreview = Math.max(16, this.width - 24);
    this.appendSystem(
      "thinking",
      preview.length > 0 ? truncateDetail(preview, maxPreview) : "thinking…",
      "pending",
    );
  }

  setReasoning(length: number): void {
    this.removeSystemEntry("reasoning");
    if (length > 0) {
      this.appendSystem("reasoning", `(${length} chars)`, "done");
    }
  }

  appendPendingTool(toolCall: ToolCall): void {
    this.removeSystemEntry("thinking");
    const existing = this.entries.find(
      (entry) => entry.kind === "tool" && entry.toolCallId === toolCall.id,
    );
    if (existing) {
      existing.text = formatToolCallLine(toolCall, "pending");
      existing.status = "pending";
      return;
    }
    this.entries.push({
      id: `act_${++this.nextId}`,
      kind: "tool",
      toolCallId: toolCall.id,
      status: "pending",
      text: formatToolCallLine(toolCall, "pending"),
    });
  }

  updateToolResult(payload: Record<string, unknown>): void {
    const finished = toolPayloadToFinishedLike(payload);
    if (finished === null) {
      return;
    }
    const status: ToolCallLineStatus = finished.success ? "done" : "failed";
    const text = formatToolCallLine(
      finished.toolCall,
      status,
      metaFromFinished(finished),
    );
    const existing = this.entries.find(
      (entry) => entry.kind === "tool" && entry.toolCallId === finished.toolCall.id,
    );
    if (existing) {
      existing.text = text;
      existing.status = status;
      return;
    }
    this.entries.push({
      id: `act_${++this.nextId}`,
      kind: "tool",
      toolCallId: finished.toolCall.id,
      status,
      text,
    });
  }

  appendVerifyLine(passed: boolean, summary: string): void {
    this.appendSystem(
      "verify",
      passed ? "passed" : truncateDetail(summary, 48),
      passed ? "done" : "failed",
    );
  }

  appendCompactLine(compactionCount: number, messageCount: number): void {
    this.appendSystem(
      "compact",
      `×${compactionCount} · ${messageCount} msgs`,
      "done",
    );
  }

  appendRawLine(text: string, status: ToolCallLineStatus = "done"): void {
    this.entries.push({
      id: `act_${++this.nextId}`,
      kind: "system",
      status,
      text,
    });
  }

  /** Visible window for TTY in-place redraw; full log when viewport is disabled. */
  render(
    options: { viewport?: boolean; bordered?: boolean; stream?: NodeJS.WriteStream } = {},
  ): string[] {
    const useViewport = options.viewport !== false;
    const bordered = options.bordered !== false;
    const stream = options.stream;
    const rule = colorActivityBorder(horizontalRule(this.width), stream);
    const visible =
      useViewport && this.entries.length > this.height
        ? this.entries.slice(-this.height)
        : useViewport
          ? this.entries.slice(-this.height)
          : this.entries;

    if (!bordered) {
      return visible.map((entry) => {
        const plain = fitEntryText(entry.text, this.width, false);
        const colored = colorActivityLine(plain, entry.status, stream);
        return `  ${colored}`;
      });
    }

    const lines: string[] = [rule];
    for (const entry of visible) {
      const plain = fitEntryText(entry.text, this.width, true);
      const colored = colorActivityLine(plain, entry.status, stream);
      lines.push(stream ? `│ ${colored}` : padPaneLine(plain, this.width));
    }
    lines.push(rule);
    return lines;
  }

  /** Flat text lines without border (for collapsed history export). */
  renderFlat(): string[] {
    return this.entries.map((entry) => entry.text);
  }

  snapshot(): ActivityEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  restore(entries: ActivityEntry[]): void {
    this.entries = entries.map((entry) => ({ ...entry }));
    this.nextId = entries.length;
  }

  private appendSystem(
    kind: "thinking" | "verify" | "compact" | "reasoning",
    detail: string,
    status: ToolCallLineStatus,
  ): void {
    this.entries.push({
      id: `act_${++this.nextId}`,
      kind: "system",
      status,
      text: formatSystemActivityLine(kind, detail, status),
    });
  }

  private removeSystemEntry(kind: "thinking" | "reasoning"): void {
    const prefix = kind.padEnd(11);
    this.entries = this.entries.filter(
      (entry) => !(entry.kind === "system" && entry.text.startsWith(prefix)),
    );
  }
}

function truncateDetail(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}

/** Re-export for tests that assert on tool.result formatting. */
export { formatToolCallLineFromResult };
