import type { AgentMode } from "@code-mind/shared";
import { ValidationError } from "@code-mind/shared";

export interface BenchmarkModeInput {
  id: string;
  mode?: AgentMode;
}

export function resolveBenchmarkMode(item: BenchmarkModeInput): AgentMode {
  if (!item.mode) {
    throw new ValidationError(
      `Benchmark case "${item.id}" must declare an explicit "mode" field.`,
    );
  }
  return item.mode;
}
