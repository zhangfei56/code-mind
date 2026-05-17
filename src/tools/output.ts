const DEFAULT_OUTPUT_LIMIT = 12_000;
const SENSITIVE_OUTPUT_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bsk-[a-zA-Z0-9]{16,}\b/g,
] as const;

export interface TruncateOptions {
  maxChars?: number;
}

export function truncateToolOutput(
  value: string,
  options: TruncateOptions = {},
): string {
  const maxChars = options.maxChars ?? DEFAULT_OUTPUT_LIMIT;
  return value.length <= maxChars
    ? value
    : `${value.slice(0, maxChars)}\n...[truncated]`;
}

export function sanitizeToolOutput(value: string): string {
  return SENSITIVE_OUTPUT_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, "[REDACTED]"),
    value,
  );
}
