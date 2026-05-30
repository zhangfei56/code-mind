import type { SubagentLoopHost } from "@code-mind/shared";
import type { ToolRegistry } from "@code-mind/execution";

/** Creates an isolated or default loop host for subagent delegation. */
export interface SubagentLoopHostFactory {
  getHost(options?: { toolRegistry?: ToolRegistry }): SubagentLoopHost;
}
