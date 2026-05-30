import type { AgentResult, RuntimeInput } from "./types.js";

/** Minimal loop host for subagent delegation without importing @code-mind/core. */
export interface SubagentLoopHost {
  run(input: RuntimeInput): Promise<AgentResult>;
}
