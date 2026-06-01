import type { AgentSession, RuntimeInput, SkillRunPolicy } from "@code-mind/shared";
import { createId } from "@code-mind/shared";
import type { ExtensionRegistry } from "@code-mind/capabilities";
import {
  collectPendingSkills,
  DEFAULT_SKILL_RUN_POLICY,
  resolveSkillSelectorInput,
} from "@code-mind/capabilities";
import type { SessionStorePort } from "./runtime/ports/session-store-port.js";
import type { SkillConfirmPrompter } from "./runtime/types.js";
import {
  skillConfirmRequestedEvent,
  skillConfirmResolvedEvent,
} from "./runtime/agent-events.js";
import { resolveProductPromptLocale } from "@code-mind/models";

export interface SkillConfirmationResolutionDeps {
  extensionRegistry?: ExtensionRegistry;
  skillRunPolicy?: SkillRunPolicy;
  skillConfirmPrompter?: SkillConfirmPrompter;
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

function readConfirmedSkillNames(session: AgentSession): string[] | undefined {
  const raw = session.task.metadata?.confirmedSkillNames;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw.map(String);
}

export async function resolveSkillConfirmationIfNeeded(
  deps: SkillConfirmationResolutionDeps,
  sessionStore: SessionStorePort,
  session: AgentSession,
  input: RuntimeInput,
): Promise<void> {
  if (input.resumeSessionId) {
    return;
  }
  if (readConfirmedSkillNames(session) !== undefined) {
    return;
  }

  const policy = deps.skillRunPolicy ?? DEFAULT_SKILL_RUN_POLICY;
  const selector = resolveSkillSelectorInput(policy);
  if (selector.exclusiveForce) {
    session.task = {
      ...session.task,
      metadata: {
        ...session.task.metadata,
        confirmedSkillNames: [],
        skillConfirmationResolved: true,
      },
    };
    return;
  }

  const pending = collectPendingSkills({
    taskText: session.task.text,
    mode: session.task.mode,
    skills: deps.extensionRegistry?.listSkills() ?? [],
    plugins: [],
    ...selector,
    exclusiveForce: false,
  });

  if (pending.length === 0 || !deps.skillConfirmPrompter) {
    session.task = {
      ...session.task,
      metadata: {
        ...session.task.metadata,
        confirmedSkillNames: [],
        skillConfirmationResolved: true,
      },
    };
    return;
  }

  const locale = resolveProductPromptLocale(
    session.modelName,
    typeof input.profile.metadata?.providerModel === "string"
      ? input.profile.metadata.providerModel
      : undefined,
  );
  const confirmId = createId("skill-confirm");

  await deps.setSessionStatus(sessionStore, session.id, "awaiting_skill_confirmation", input);
  await deps.publish(
    input,
    skillConfirmRequestedEvent({
      confirmId,
      pending: pending.map((skill) => ({
        name: skill.name,
        score: skill.score,
        reason: skill.reason,
      })),
      taskText: session.task.text,
    }),
  );

  const confirmed: string[] = [];
  for (const skill of pending) {
    const result = await deps.skillConfirmPrompter.confirm(
      {
        sessionId: session.id,
        confirmId,
        taskText: session.task.text,
        skillName: skill.name,
        skillDescription: skill.description,
        score: skill.score,
        reason: skill.reason,
        locale,
      },
      {
        onPending: async (pendingId) => {
          await deps.publish(
            input,
            skillConfirmRequestedEvent({
              confirmId: pendingId,
              pending: pending.map((entry) => ({
                name: entry.name,
                score: entry.score,
                reason: entry.reason,
              })),
              taskText: session.task.text,
            }),
          );
        },
      },
    );
    if (result.confirmed) {
      confirmed.push(skill.name);
    }
  }

  await deps.setSessionStatus(sessionStore, session.id, "running", input);
  await deps.publish(
    input,
    skillConfirmResolvedEvent({
      confirmId,
      confirmed,
      declined: pending.map((skill) => skill.name).filter((name) => !confirmed.includes(name)),
    }),
  );

  session.task = {
    ...session.task,
    metadata: {
      ...session.task.metadata,
      confirmedSkillNames: confirmed,
      skillConfirmationResolved: true,
    },
  };
}
