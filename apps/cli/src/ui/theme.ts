const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
} as const;

export function isColorEnabled(stream: NodeJS.WriteStream = process.stdout): boolean {
  if (process.env.NO_COLOR !== undefined) {
    return false;
  }
  if (process.env.FORCE_COLOR === "0") {
    return false;
  }
  return stream.isTTY === true;
}

function paint(code: string, text: string, stream?: NodeJS.WriteStream): string {
  if (!isColorEnabled(stream)) {
    return text;
  }
  return `${code}${text}${ANSI.reset}`;
}

export const theme = {
  bold: (text: string, stream?: NodeJS.WriteStream) => paint(ANSI.bold, text, stream),
  dim: (text: string, stream?: NodeJS.WriteStream) => paint(ANSI.dim, text, stream),
  cyan: (text: string, stream?: NodeJS.WriteStream) => paint(ANSI.cyan, text, stream),
  green: (text: string, stream?: NodeJS.WriteStream) => paint(ANSI.green, text, stream),
  yellow: (text: string, stream?: NodeJS.WriteStream) => paint(ANSI.yellow, text, stream),
  red: (text: string, stream?: NodeJS.WriteStream) => paint(ANSI.red, text, stream),
  magenta: (text: string, stream?: NodeJS.WriteStream) => paint(ANSI.magenta, text, stream),
  blue: (text: string, stream?: NodeJS.WriteStream) => paint(ANSI.blue, text, stream),
  gray: (text: string, stream?: NodeJS.WriteStream) => paint(ANSI.gray, text, stream),
};

export function statusColor(status: string): (text: string) => string {
  switch (status) {
    case "success":
      return theme.green;
    case "failed":
    case "permission_denied":
    case "user_rejected":
      return theme.red;
    case "stopped_by_limit":
    case "cancelled":
      return theme.yellow;
    default:
      return theme.cyan;
  }
}

export function hr(width = 56, stream?: NodeJS.WriteStream): string {
  const line = "─".repeat(Math.min(width, process.stdout.columns ?? width));
  return theme.dim(line, stream);
}

export function shortPath(path: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (home && path.startsWith(home)) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}
