import type { ToolCall } from "@code-mind/shared";

export type ApprovalPromptChoice = "once" | "always" | "deny" | "explain";

export function parseApprovalPromptInput(line: string): ApprovalPromptChoice | undefined {
  const trimmed = line.trim().toLowerCase();
  if (trimmed === "y" || trimmed === "yes") {
    return "once";
  }
  if (trimmed === "a" || trimmed === "always") {
    return "always";
  }
  if (trimmed === "n" || trimmed === "no") {
    return "deny";
  }
  if (trimmed === "e" || trimmed === "explain") {
    return "explain";
  }
  return undefined;
}

export function alwaysAllowKey(toolCall: ToolCall): string {
  const args = (toolCall.arguments ?? {}) as Record<string, unknown>;
  if (toolCall.name === "run_shell" && typeof args.command === "string") {
    const command = args.command.trim();
    const base = command.split(/\s+/).slice(0, 2).join(" ");
    return `run_shell:${base}`;
  }
  return toolCall.name;
}
