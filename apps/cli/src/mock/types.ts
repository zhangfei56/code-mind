import type { AgentMode, AgentResult, AgentEvent, UserTask, AgentEventInput } from "@code-mind/shared";
import { buildAgentEvent } from "@code-mind/shared";

export interface MockScenario {
  id: string;
  description: string;
  taskText: string;
  mode: AgentMode;
  cwd: string;
  task: UserTask;
  result: AgentResult;
  events: AgentEvent[];
}

export const MOCK_SESSION_ID = "session_mock001-aaaa-bbbb-cccc";

export const MOCK_RUN_ID = "mock_run";

export function mockAgentEvent(seq: number, input: AgentEventInput): AgentEvent {
  return buildAgentEvent(
    {
      runId: MOCK_RUN_ID,
      sessionId: MOCK_SESSION_ID,
      source: { component: "cli-mock", surface: "cli" },
    },
    seq,
    input,
  );
}

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
