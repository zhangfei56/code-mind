import type { AgentMode } from "@code-mind/shared";

/** System attachment for main sessions: when to delegate vs stay in main loop. */
export function buildSubagentDelegationBlock(
  mode: AgentMode,
  isSubagentSession: boolean,
): string | null {
  if (isSubagentSession) {
    return null;
  }

  if (mode === "ask") {
    return [
      "Sub-agent delegation policy:",
      "- ask mode is read-only and does not expose run_subagent.",
      "- Use read_file, list_dir, and grep directly in the main loop.",
      "- Do not attempt run_subagent in ask mode.",
    ].join("\n");
  }

  return [
    "Sub-agent delegation policy:",
    "- Default: stay in the main loop with read_file, grep, and list_dir.",
    "- Use run_subagent only when you have a specific, verifiable sub-question.",
    "- explore: read-only research across multiple areas (trace a flow, map modules). Max ~4 steps.",
    "- plan: read-only implementation planning when inspection is heavy. Max ~5 steps.",
    "- Custom agents under .agent/agents/ only when the user asks or the task matches their description.",
    "",
    "Spawn explore/plan when:",
    "- The sub-question is concrete (e.g. trace X from A to B, list all tests for Y).",
    "- The search is broad enough that many reads would clutter this session.",
    "",
    "Do NOT spawn when:",
    "- The task is vague (\"find bugs\", \"explore codebase\"). Narrow the target first.",
    "- You already read the key files and the next step is patch or test.",
    "- The scope is 1–3 files or a single module.",
    "",
    "After run_subagent returns:",
    "- Treat the summary as observations, not the final user answer.",
    "- Spot-check critical paths yourself before patching.",
    "- Sub-agents cannot patch source files or spawn nested sub-agents.",
  ].join("\n");
}
