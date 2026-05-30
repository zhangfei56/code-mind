import type { AgentResultStatus, TokenUsage } from "@code-mind/shared";

export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return String(value);
}

export function formatContextUsage(inputTokens: number, maxContextTokens?: number): string {
  const size = formatTokenCount(inputTokens);
  if (!maxContextTokens || maxContextTokens <= 0) {
    return size;
  }
  const pct = Math.round((inputTokens / maxContextTokens) * 100);
  return `${size}/${formatTokenCount(maxContextTokens)} (${pct}%)`;
}

export function formatTokenUsageSummary(usage: TokenUsage): string {
  return `in ${formatTokenCount(usage.inputTokens)} · out ${formatTokenCount(usage.outputTokens)}`;
}

export function outcomeGlyph(status: AgentResultStatus | string): string {
  switch (status) {
    case "success":
      return "✓";
    case "failed":
    case "permission_denied":
    case "user_rejected":
      return "✕";
    case "stopped_by_limit":
    case "cancelled":
      return "⚠";
    default:
      return "·";
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }
  return `${(ms / 1_000).toFixed(1)}s`;
}
