const DEFAULT_WIDTH = 88;

function isCjkCharacter(value: string): boolean {
  return /[\u3400-\u9FFF]/.test(value);
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

export function resolveTerminalWidth(
  stream?: NodeJS.WriteStream,
  fallback = DEFAULT_WIDTH,
): number {
  const streamWidth = stream?.columns;
  if (typeof streamWidth === "number" && streamWidth > 0) {
    return streamWidth;
  }
  const stderrWidth = process.stderr.columns;
  if (typeof stderrWidth === "number" && stderrWidth > 0) {
    return stderrWidth;
  }
  return fallback;
}

export function wrapText(text: string, width: number, indent = ""): string[] {
  const effectiveWidth = Math.max(20, width);
  const tokens = tokenizeForWrap(text.replace(/\r\n/g, "\n").trim());
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
    if (candidate.length <= effectiveWidth || current === indent) {
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

export function wrapPrefixedBlock(text: string, width: number, prefix = "  "): string[] {
  const contentWidth = Math.max(20, width - prefix.length);
  return wrapText(text, contentWidth, prefix);
}

export function displayWidth(text: string): number {
  let width = 0;
  for (const character of text) {
    width += isCjkCharacter(character) ? 2 : 1;
  }
  return width;
}

export function truncateToWidth(text: string, maxWidth: number): string {
  if (displayWidth(text) <= maxWidth) {
    return text;
  }
  if (maxWidth <= 1) {
    return "…";
  }
  let width = 0;
  let result = "";
  for (const character of text) {
    const charWidth = isCjkCharacter(character) ? 2 : 1;
    if (width + charWidth > maxWidth - 1) {
      return `${result}…`;
    }
    result += character;
    width += charWidth;
  }
  return result;
}
