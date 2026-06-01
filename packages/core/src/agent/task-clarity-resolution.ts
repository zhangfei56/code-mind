import type { AgentSession, RuntimeInput } from "@code-mind/shared";
import { createId, nowIso } from "@code-mind/shared";
import type { SessionStorePort } from "./runtime/ports/session-store-port.js";
import {
  buildClarifyQuestion,
  formatClarificationContext,
  shouldRequestClarify,
} from "./task-clarity.js";
import type { ClarifyPrompter } from "./runtime/types.js";
import {
  clarifyRequestedEvent,
  clarifyResolvedEvent,
  messageUserEvent,
} from "./runtime/agent-events.js";
import { resolveProductPromptLocale } from "@code-mind/models";

export interface ClarifyResolutionDeps {
  clarifyPrompter?: ClarifyPrompter;
  setSessionStatus: (
    sessionStore: SessionStorePort,
    sessionId: string,
    status: import("@code-mind/shared").SessionStatus,
    input?: RuntimeInput,
  ) => Promise<void>;
  publish: (
    input: RuntimeInput | undefined,
    event: import("@code-mind/shared").AgentEventInput,
  ) => Promise<void>;
}

export async function resolveTaskClarityIfNeeded(
  deps: ClarifyResolutionDeps,
  sessionStore: SessionStorePort,
  session: AgentSession,
  input: RuntimeInput,
): Promise<void> {
  if (input.resumeSessionId) {
    return;
  }
  if (!shouldRequestClarify(session.task)) {
    return;
  }
  if (!deps.clarifyPrompter) {
    return;
  }

  const locale = resolveProductPromptLocale(
    session.modelName,
    typeof input.profile.metadata?.providerModel === "string"
      ? input.profile.metadata.providerModel
      : undefined,
  );
  const question = buildClarifyQuestion(session.task, session.workspaceRoot, locale);
  const clarifyId = createId("clarify");

  await deps.setSessionStatus(sessionStore, session.id, "awaiting_clarification", input);
  await deps.publish(
    input,
    clarifyRequestedEvent({
      clarifyId,
      question,
      taskText: session.task.text,
    }),
  );

  const result = await deps.clarifyPrompter.clarify(
    {
      sessionId: session.id,
      clarifyId,
      taskText: session.task.text,
      question,
    },
    {
      onPending: async (pendingId) => {
        await deps.publish(
          input,
          clarifyRequestedEvent({
            clarifyId: pendingId,
            question,
            taskText: session.task.text,
          }),
        );
      },
    },
  );

  await deps.setSessionStatus(sessionStore, session.id, "running", input);
  await deps.publish(
    input,
    clarifyResolvedEvent({
      clarifyId: result.clarifyId ?? clarifyId,
      skipped: result.skipped === true,
      answer: result.answer,
    }),
  );

  session.task = {
    ...session.task,
    metadata: {
      ...session.task.metadata,
      clarified: true,
      ...(result.skipped ? { clarifySkipped: true } : {}),
      ...(result.answer.trim().length > 0 ? { clarifyAnswer: result.answer } : {}),
    },
  };

  const clarificationText = formatClarificationContext(result.answer, locale);
  if (clarificationText.length > 0) {
    const userMessage = {
      id: createId("msg"),
      role: "user" as const,
      content: clarificationText,
      createdAt: nowIso(),
    };
    session.messages.push(userMessage);
    await deps.publish(input, messageUserEvent(userMessage.content));
  }
}
