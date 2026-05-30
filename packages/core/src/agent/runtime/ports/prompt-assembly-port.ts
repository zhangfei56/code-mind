import type { AgentSession, ContextManager, RuntimeInput } from "@code-mind/shared";
import type { PromptAssemblyPort } from "../../kernel/ports.js";
import type { RunState } from "../run-state.js";

export function createPromptAssemblyPort(
  contextManager: ContextManager,
  session: AgentSession,
): PromptAssemblyPort {
  return {
    async assemble(input: RuntimeInput, _runState: RunState) {
      return contextManager.build({
        session,
        task: input.task,
        profile: input.profile,
      });
    },
  };
}

export function createPromptAssemblyPortFactory(
  contextManager: ContextManager,
): (session: AgentSession) => PromptAssemblyPort {
  return (session) => createPromptAssemblyPort(contextManager, session);
}
