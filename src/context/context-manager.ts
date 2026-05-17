import { findProjectRules } from "../workspace/project-rules.js";
import { createId } from "../shared/ids.js";
import { nowIso } from "../shared/time.js";
import type {
  AgentSession,
  ContextBuildInput,
  ContextManager,
  ContextSnapshot,
  InternalMessage,
  Observation,
} from "../shared/types.js";
import { createRuntimeSystemPrompt } from "./system-prompt.js";

export class DefaultContextManager implements ContextManager {
  async build(input: ContextBuildInput): Promise<ContextSnapshot> {
    const { session, task, profile } = input;
    const projectRules = findProjectRules(session.workspaceRoot);

    const messages: InternalMessage[] = [
      {
        id: createId("msg"),
        role: "system",
        content: createRuntimeSystemPrompt(profile.systemPrompt),
        createdAt: nowIso(),
      },
      ...(projectRules.content
        ? [
            {
              id: createId("msg"),
              role: "system" as const,
              content: `Project rules from ${projectRules.source}:\n${projectRules.content}`,
              createdAt: nowIso(),
            },
          ]
        : []),
      ...session.messages,
    ];

    return {
      messages,
      metadata: {
        task: task.text,
      },
    };
  }

  async addObservation(session: AgentSession, observation: Observation): Promise<void> {
    session.observations.push(observation);
    session.updatedAt = nowIso();
  }
}
