type LogLevel = "error" | "warn" | "info" | "debug";

const REDACTED_KEYS = new Set([
  "apiKey",
  "authorization",
  "Authorization",
  "token",
  "accessToken",
  "secret",
  "password",
]);

const LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function sanitizeMetadata(value: unknown, depth = 0): unknown {
  if (depth >= 3) {
    return "[truncated]";
  }
  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 497)}...` : value;
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeMetadata(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      REDACTED_KEYS.has(key) ? "[redacted]" : sanitizeMetadata(entry, depth + 1),
    ]),
  );
}

function currentLevel(): LogLevel {
  const value = process.env.AGENT_LOG_LEVEL?.trim().toLowerCase();
  if (value === "error" || value === "warn" || value === "info" || value === "debug") {
    return value;
  }
  return "info";
}

export function logProcess(
  component: string,
  level: LogLevel,
  message: string,
  metadata?: unknown,
): void {
  if (LEVELS[level] > LEVELS[currentLevel()]) {
    return;
  }
  const suffix =
    metadata === undefined ? "" : ` ${JSON.stringify(sanitizeMetadata(metadata))}`;
  process.stderr.write(
    `[${new Date().toISOString()}] ${level.toUpperCase()} ${component} ${message}${suffix}\n`,
  );
}
