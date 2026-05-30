import type { AgentSession, ContextManager, Observation } from "@code-mind/shared";
import type { ObservationPort } from "../../kernel/ports.js";

export function createObservationPort(contextManager: ContextManager): ObservationPort {
  return {
    addObservation: async (session, observation) => {
      await contextManager.addObservation(session, observation);
    },
  };
}

export function createObservationPortFactory(
  contextManager: ContextManager,
): (session: AgentSession) => ObservationPort {
  return () => createObservationPort(contextManager);
}
