import type { DisplayLevel } from "./display-level.js";

export interface FinalTextFormatOptions {
  level: DisplayLevel;
  width?: number;
  stream?: NodeJS.WriteStream;
}

type FinalTextBlock =
  | { type: "heading"; depth: number; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; fence: string; lines: string[] }
  | { type: "table"; rows: string[][] }
  | { type: "paragraph"; text: string };

function stripControlCharacters(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
}

function normalizeLine(line: string): string {
  return stripControlCharacters(line.replace(/\ufffd+/g, "").trimEnd());
}

function stripLeadInBeforeHeading(text: string): string {
  return text.replace(
    /^(?:结论|总结|回答|结果|Answer|Summary|Conclusion)\s*[:：]\s*(?=#{1,6}\s+)/i,
    "",
  );
}

function isTableSeparator(line: string): boolean {
  const cells = line
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function splitTableRow(line: string): string[] {
  return line
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0);
}

function isListLine(line: string): boolean {
  return /^([-*]|\d+\.)\s+/.test(line.trimStart());
}

function isCjkCharacter(value: string): boolean {
  return /[\u3400-\u9FFF]/.test(value);
}

function transformNonCodeInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_([^_]+)_(?!_)/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1");
}

function normalizeInlineMarkdown(text: string): string {
  const parts = text.split(/(`[^`]*`)/g);
  return parts
    .map((part) => (part.startsWith("`") && part.endsWith("`") ? part : transformNonCodeInlineMarkdown(part)))
    .join("");
}

function tokenizeForWrap(text: string): string[] {
  const tokens: string[] = [];
  for (let index = 0; index < text.length;) {
    const current = text[index] ?? "";

    if (/\s/.test(current)) {
      while (index < text.length && /\s/.test(text[index] ?? "")) {
        index += 1;
      }
      tokens.push(" ");
      continue;
    }

    if (current === "`") {
      let end = index + 1;
      while (end < text.length && (text[end] ?? "") !== "`") {
        end += 1;
      }
      if (end < text.length) {
        end += 1;
      }
      tokens.push(text.slice(index, end));
      index = end;
      continue;
    }

    if (isCjkCharacter(current)) {
      tokens.push(current);
      index += 1;
      continue;
    }

    if (/[A-Za-z0-9_./:@-]/.test(current)) {
      let end = index + 1;
      while (end < text.length && /[A-Za-z0-9_./:@-]/.test(text[end] ?? "")) {
        end += 1;
      }
      tokens.push(text.slice(index, end));
      index = end;
      continue;
    }

    tokens.push(current);
    index += 1;
  }
  return tokens;
}

function wrapText(text: string, width: number, indent = ""): string[] {
  const tokens = tokenizeForWrap(text);
  if (tokens.length === 0) {
    return [indent];
  }
  const lines: string[] = [];
  let current = indent;
  let pendingSpace = false;

  for (const token of tokens) {
    if (token === " ") {
      pendingSpace = current !== indent;
      continue;
    }

    const prefix = pendingSpace ? " " : "";
    const candidate = `${current}${prefix}${token}`;
    if (candidate.length <= width || current === indent) {
      current = candidate;
      pendingSpace = false;
      continue;
    }

    lines.push(current);
    current = `${indent}${token}`;
    pendingSpace = false;
  }

  lines.push(current);
  return lines;
}

function parseBlocks(lines: string[]): FinalTextBlock[] {
  const blocks: FinalTextBlock[] = [];

  for (let index = 0; index < lines.length;) {
    const current = lines[index] ?? "";
    const trimmed = current.trim();

    if (trimmed.length === 0) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const fence = trimmed;
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({ type: "code", fence, lines: codeLines });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        depth: headingMatch[1]?.length ?? 1,
        text: headingMatch[2] ?? "",
      });
      index += 1;
      continue;
    }

    const next = lines[index + 1] ?? "";
    if (current.includes("|") && next.includes("|") && isTableSeparator(next.trim())) {
      const tableLines = [current];
      index += 2;
      while (index < lines.length && (lines[index] ?? "").includes("|")) {
        tableLines.push(lines[index] ?? "");
        index += 1;
      }
      const rows = tableLines.map(splitTableRow).filter((row) => row.length > 0);
      blocks.push({ type: "table", rows });
      continue;
    }

    if (isListLine(trimmed)) {
      const listLines: string[] = [];
      while (index < lines.length && isListLine((lines[index] ?? "").trimStart())) {
        listLines.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push({
        type: "list",
        ordered: /^\d+\./.test(listLines[0]?.trimStart() ?? ""),
        items: listLines.map((line) => line.trimStart().replace(/^([-*]|\d+\.)\s+/, "")),
      });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const line = lines[index] ?? "";
      const lineTrimmed = line.trim();
      const lookahead = lines[index + 1] ?? "";
      if (
        lineTrimmed.length === 0 ||
        lineTrimmed.startsWith("```") ||
        /^#{1,6}\s+/.test(lineTrimmed) ||
        isListLine(lineTrimmed) ||
        (line.includes("|") && lookahead.includes("|") && isTableSeparator(lookahead.trim()))
      ) {
        break;
      }
      paragraphLines.push(lineTrimmed);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function renderHeading(block: Extract<FinalTextBlock, { type: "heading" }>, level: DisplayLevel, width: number): string[] {
  const lines = [normalizeInlineMarkdown(block.text)];
  if (level >= 2 && block.depth === 1) {
    lines.push("─".repeat(Math.min(block.text.length, width)));
  }
  return lines;
}

function renderList(block: Extract<FinalTextBlock, { type: "list" }>, width: number): string[] {
  return block.items.flatMap((item, index) => {
    const marker = block.ordered ? `${index + 1}.` : "-";
    const wrapped = wrapText(normalizeInlineMarkdown(item), width, "  ");
    if (wrapped.length === 0) {
      return [`${marker}`];
    }
    return [`${marker} ${wrapped[0]?.trimStart() ?? ""}`, ...wrapped.slice(1)];
  });
}

function renderCode(block: Extract<FinalTextBlock, { type: "code" }>): string[] {
  return [block.fence, ...block.lines, "```"];
}

function renderTable(block: Extract<FinalTextBlock, { type: "table" }>, width: number): string[] {
  const headers = block.rows[0] ?? [];
  const rows = block.rows.slice(1);
  if (headers.length === 0 || rows.length === 0) {
    return wrapText(normalizeInlineMarkdown(block.rows.flat().join(" ")), width);
  }

  const rendered: string[] = [];
  for (const row of rows) {
    const firstLabel = headers[0] ?? "Row";
    const firstValue = row[0] ?? "";
    rendered.push(`- ${normalizeInlineMarkdown(firstLabel)}: ${normalizeInlineMarkdown(firstValue)}`);
    for (let index = 1; index < headers.length; index += 1) {
      const header = headers[index];
      const value = row[index];
      if (!header || !value) {
        continue;
      }
      rendered.push(...wrapText(`${normalizeInlineMarkdown(header)}: ${normalizeInlineMarkdown(value)}`, width, "  "));
    }
    rendered.push("");
  }
  return rendered.at(-1) === "" ? rendered.slice(0, -1) : rendered;
}

function renderParagraph(block: Extract<FinalTextBlock, { type: "paragraph" }>, width: number): string[] {
  return wrapText(normalizeInlineMarkdown(block.text), width);
}

function resolveFormatWidth(options: FinalTextFormatOptions): number {
  if (typeof options.width === "number" && options.width > 0) {
    return options.width;
  }
  const streamWidth = options.stream?.columns;
  if (typeof streamWidth === "number" && streamWidth > 0) {
    return Math.max(20, streamWidth - 2);
  }
  return 88;
}

function renderBlock(block: FinalTextBlock, options: FinalTextFormatOptions): string[] {
  const width = resolveFormatWidth(options);
  switch (block.type) {
    case "heading":
      return renderHeading(block, options.level, width);
    case "list":
      return renderList(block, width);
    case "code":
      return renderCode(block);
    case "table":
      return renderTable(block, width);
    case "paragraph":
      return renderParagraph(block, width);
  }
}

export function normalizeFinalText(text: string): string {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(normalizeLine)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return stripLeadInBeforeHeading(normalized);
}

export function formatFinalText(text: string, options: FinalTextFormatOptions): string {
  const normalized = normalizeFinalText(text);
  if (normalized.length === 0) {
    return "";
  }
  const blocks = parseBlocks(normalized.split("\n"));
  const rendered = blocks.flatMap((block, index) => {
    const lines = renderBlock(block, options);
    if (index === blocks.length - 1) {
      return lines;
    }
    return [...lines, ""];
  });
  return rendered.join("\n").trim();
}
