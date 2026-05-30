export type DisplayLevel = 0 | 1 | 2 | 3 | 4;

export type DisplayMode = DisplayLevel | "json" | "jsonl";

import type { ApprovalPromptStyle } from "./agent-output/blocks.js";

export interface DisplayOptions {
  json?: boolean;
  jsonl?: boolean;
  verbose?: boolean;
  trace?: boolean;
  debug?: boolean;
  interactive?: boolean;
  approvalPromptStyle?: ApprovalPromptStyle;
}

export function resolveDisplayMode(options: DisplayOptions): DisplayMode {
  if (options.json) {
    return "json";
  }
  if (options.jsonl) {
    return "jsonl";
  }
  if (options.debug) {
    return 4;
  }
  if (options.trace) {
    return 3;
  }
  if (options.verbose) {
    return 2;
  }
  if (options.interactive) {
    return 1;
  }
  return 0;
}

export function showsEventLog(level: DisplayLevel): boolean {
  return level >= 2;
}

export function showsTraceDetail(level: DisplayLevel): boolean {
  return level >= 3;
}

export function showsDebugEventStream(level: DisplayLevel): boolean {
  return level >= 4;
}

/** Token-level stream chunks belong in events.jsonl, not human CLI lines. */
export function isTokenStreamEvent(kind: string): boolean {
  return kind === "model.reasoning.delta" || kind === "model.content.delta";
}
