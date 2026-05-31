import { isColorEnabled, theme } from "./theme.js";
import type { ToolCallLineStatus } from "./agent-output/tool-call-line.js";

function enabled(stream?: NodeJS.WriteStream): boolean {
  return stream !== undefined && isColorEnabled(stream);
}

export function colorSectionLabel(label: string, stream?: NodeJS.WriteStream): string {
  if (!enabled(stream)) {
    return label;
  }
  return theme.cyan(label, stream);
}

export function colorNarrativeLine(line: string, _stream?: NodeJS.WriteStream): string {
  return line;
}

export function colorThinkingPreview(line: string, stream?: NodeJS.WriteStream): string {
  if (!enabled(stream)) {
    return line;
  }
  if (line.length <= 13) {
    return theme.magenta(line, stream);
  }
  const indent = line.slice(0, 2);
  const labelField = line.slice(2, 13);
  const tail = line.slice(13);
  const label = labelField.trimEnd();
  const labelPad = labelField.slice(label.length);
  return `${indent}${theme.magenta(label, stream)}${labelPad}${theme.dim(tail, stream)}`;
}

export function colorFoldLine(line: string, stream?: NodeJS.WriteStream): string {
  if (!enabled(stream)) {
    return line;
  }
  return theme.dim(line, stream);
}

export function colorActivityBorder(line: string, stream?: NodeJS.WriteStream): string {
  if (!enabled(stream)) {
    return line;
  }
  return theme.dim(line, stream);
}

export function colorApprovalLabel(label: string, stream?: NodeJS.WriteStream): string {
  if (!enabled(stream)) {
    return label;
  }
  return theme.cyan(label, stream);
}

function colorStatusSuffix(suffix: string, status: ToolCallLineStatus, stream: NodeJS.WriteStream): string {
  if (status === "pending") {
    return theme.yellow(suffix, stream);
  }
  if (status === "failed") {
    return theme.red(suffix, stream);
  }
  const match = suffix.match(/^(\s{2}✓)([\s\S]*)$/);
  if (match) {
    const glyph = match[1]!;
    const meta = match[2] ?? "";
    return `${theme.green(glyph, stream)}${theme.dim(meta, stream)}`;
  }
  return theme.green(suffix, stream);
}

function colorSystemKind(kind: string, stream: NodeJS.WriteStream): string {
  if (kind === "thinking" || kind === "reasoning") {
    return theme.magenta(kind, stream);
  }
  if (kind === "verify" || kind === "compact") {
    return theme.gray(kind, stream);
  }
  return theme.cyan(kind, stream);
}

function splitStatusSuffix(line: string): { body: string; suffix: string } {
  const match = line.match(/(\s{2}(?:…|✓|×)[\s\S]*)$/);
  if (!match) {
    return { body: line, suffix: "" };
  }
  return { body: line.slice(0, -match[1]!.length), suffix: match[1]! };
}

/** Color a plain activity log line (tool or system). */
export function colorActivityLine(
  line: string,
  status: ToolCallLineStatus,
  stream?: NodeJS.WriteStream,
): string {
  if (!enabled(stream)) {
    return line;
  }
  const out = stream!;

  const { body, suffix } = splitStatusSuffix(line);
  const trimmed = body.trimStart();
  const indent = body.slice(0, body.length - trimmed.length);
  const kind = trimmed.split(/\s+/)[0] ?? "";

  if (kind === "thinking" || kind === "reasoning" || kind === "verify" || kind === "compact") {
    const rest = trimmed.slice(kind.length).trimStart();
    const labelPad = " ".repeat(Math.max(1, 11 - kind.length));
    const coloredDetail =
      kind === "thinking" || kind === "reasoning" ? theme.dim(rest, out) : rest;
    const coloredSuffix = suffix.length > 0 ? colorStatusSuffix(suffix, status, out) : "";
    return `${indent}${colorSystemKind(kind, out)}${labelPad}${rest.length > 0 ? ` ${coloredDetail}` : ""}${coloredSuffix}`;
  }

  if (body.length < 11) {
    return line;
  }

  const name = body.slice(0, 11);
  const args = body.slice(11);
  const coloredSuffix = suffix.length > 0 ? colorStatusSuffix(suffix, status, out) : "";
  return `${theme.cyan(name, out)}${theme.blue(args, out)}${coloredSuffix}`;
}

export function colorApprovalBodyLine(
  line: string,
  stream?: NodeJS.WriteStream,
  options: { command?: boolean } = {},
): string {
  if (!enabled(stream)) {
    return line;
  }
  const trimmed = line.trimStart();
  const indent = line.slice(0, line.length - trimmed.length);
  if (options.command || trimmed.startsWith("cd ") || trimmed.includes("pnpm ") || trimmed.includes("npm ")) {
    return `${indent}${theme.blue(trimmed, stream)}`;
  }
  return `${indent}${trimmed}`;
}

export function colorHeaderValue(label: string, value: string, stream?: NodeJS.WriteStream): string {
  if (!enabled(stream)) {
    return `  ${label}: ${value}`;
  }
  return `  ${theme.dim(`${label}:`, stream)} ${value}`;
}
