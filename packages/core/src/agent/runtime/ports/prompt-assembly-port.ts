import type { AgentSession, ContextManager, RuntimeInput } from "@code-mind/shared";
import type { PromptAssemblyPort } from "../../kernel/ports.js";
import type { RunState } from "../run-state.js";
import { toRunFactsSnapshot } from "../run-facts-snapshot.js";

export function createPromptAssemblyPort(
  contextManager: ContextManager,
  session: AgentSession,
): PromptAssemblyPort {
  return {
    async assemble(input: RuntimeInput, runState: RunState) {
      return contextManager.build({
        session,
        task: input.task,
        profile: input.profile,
        runFacts: toRunFactsSnapshot(input, session, runState),
      });
    },
  };
}

export function createPromptAssemblyPortFactory(
  contextManager: ContextManager,
): (session: AgentSession) => PromptAssemblyPort {
  return (session) => createPromptAssemblyPort(contextManager, session);
}
