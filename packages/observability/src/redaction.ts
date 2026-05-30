const REDACTED_KEYS = new Set([
  "apiKey",
  "authorization",
  "Authorization",
  "token",
  "accessToken",
  "secret",
  "password",
]);

const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_LENGTH = 20;
const MAX_OBJECT_ENTRIES = 40;
const MAX_DEPTH = 4;

export interface RedactionOptions {
  rawLogging?: boolean;
}

function truncateString(value: string): string {
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH - 3)}...`
    : value;
}

export function sanitizeForLog(value: unknown, depth = 0, rawLogging = false): unknown {
  if (rawLogging) {
    return value;
  }
  if (depth >= MAX_DEPTH) {
    return "[truncated]";
  }
  if (typeof value === "string") {
    return truncateString(value);
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: truncateString(value.stack ?? ""),
    };
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeForLog(item, depth + 1, rawLogging));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_OBJECT_ENTRIES)
        .map(([key, entry]) => [
          key,
          REDACTED_KEYS.has(key)
            ? "[redacted]"
            : sanitizeForLog(entry, depth + 1, rawLogging),
        ]),
    );
  }
  return String(value);
}

export function redactEvent<T extends { payload: Record<string, unknown>; refs?: unknown[] }>(
  event: T,
  options: RedactionOptions = {},
): T {
  const rawLogging = options.rawLogging === true;
  return {
    ...event,
    payload: sanitizeForLog(event.payload, 0, rawLogging) as Record<string, unknown>,
    ...(event.refs === undefined
      ? {}
      : { refs: sanitizeForLog(event.refs, 0, rawLogging) as T["refs"] }),
  };
}
