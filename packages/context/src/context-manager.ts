import { findProjectRules } from "@code-mind/workspace";
import { createId, nowIso } from "@code-mind/shared";
import type {
  AgentSession,
  ContextBuildInput,
  ContextManager,
  ContextSnapshot,
  InternalMessage,
  Observation,
} from "@code-mind/shared";
import { NoopMemoryProvider } from "@code-mind/memory";
import {
  getModelEnvironmentPrompt,
  getModelSpecificPrompt,
  getProductPrompt,
  resolveProductPromptLocale,
} from "@code-mind/models";
import { createRuntimeSystemPrompt } from "./system-prompt.js";
import { buildRunFactsBlock } from "./run-facts-block.js";
import { buildPlanModeAttachment } from "./plan-mode-attachment.js";
import { buildSubagentDelegationBlock } from "./subagent-delegation-block.js";
import { buildRepoMap } from "./repo-map.js";

const defaultMemoryProvider = new NoopMemoryProvider();

function resolveContextLocale(input: ContextBuildInput): ReturnType<typeof resolveProductPromptLocale> {
  const stored = input.profile.metadata?.promptLocale;
  if (stored === "zh" || stored === "en") {
    return stored;
  }
  const providerModel =
    typeof input.profile.metadata?.providerModel === "string"
      ? input.profile.metadata.providerModel
      : undefined;
  return resolveProductPromptLocale(input.session.modelName, providerModel);
}

function buildAgentModePolicy(
  mode: ContextBuildInput["task"]["mode"],
  locale: ReturnType<typeof resolveProductPromptLocale>,
): string {
  return getProductPrompt("mode-policy", locale, { mode });
}

function buildPermissionSummary(
  locale: ReturnType<typeof resolveProductPromptLocale>,
): string {
  return getProductPrompt("permission", locale);
}

function buildModeExecutionSummary(
  session: AgentSession,
  locale: ReturnType<typeof resolveProductPromptLocale>,
  runFacts?: ContextBuildInput["runFacts"],
): string {
  return buildRunFactsBlock(session, { locale, ...(runFacts === undefined ? {} : { runFacts }) });
}

function wrapUntrustedContent(
  source: string,
  content: string,
  locale: ReturnType<typeof resolveProductPromptLocale>,
): string {
  return getProductPrompt("untrusted-wrapper", locale, { source, content });
}

function formatSessionReferenceDate(session: AgentSession): string {
  const parsed = new Date(session.createdAt);
  return Number.isNaN(parsed.getTime()) ? new Date().toDateString() : parsed.toDateString();
}

export class DefaultContextManager implements ContextManager {
  async build(input: ContextBuildInput): Promise<ContextSnapshot> {
    const { session, task, profile } = input;
    const locale = resolveContextLocale(input);
    const projectRules = findProjectRules(session.workspaceRoot);
    const memoryItems = await defaultMemoryProvider.inject({
      sessionId: session.id,
      taskText: task.text,
    });

    const providerModel =
      typeof profile.metadata?.providerModel === "string"
        ? profile.metadata.providerModel
        : undefined;

    const shouldIncludeRepoMap =
      (input.runFacts?.scopeControlActive === true ||
        input.runFacts?.atWorkspaceRoot === true) &&
      (task.mode === "edit" || task.mode === "agent");
    const repoMapBlock = shouldIncludeRepoMap
      ? await buildRepoMap(session.workspaceRoot)
      : undefined;

    const messages: InternalMessage[] = [
      {
        id: createId("msg"),
        role: "system",
        content: createRuntimeSystemPrompt(profile.systemPrompt, {
          modelName: session.modelName,
          workspaceRoot: session.workspaceRoot,
          cwd: task.cwd,
          ...(providerModel === undefined ? {} : { providerModel }),
          locale,
        }),
        createdAt: nowIso(),
      },
      {
        id: createId("msg"),
        role: "system",
        content: getModelSpecificPrompt(
          session.modelName,
          providerModel === undefined ? {} : { providerModel },
        ),
        createdAt: nowIso(),
      },
      {
        id: createId("msg"),
        role: "system",
        content: getModelEnvironmentPrompt({
          modelName: session.modelName,
          workspaceRoot: session.workspaceRoot,
          cwd: task.cwd,
          isGitRepo: session.metadata?.isGitRepo === true,
          locale,
          referenceDate: formatSessionReferenceDate(session),
          ...(providerModel === undefined ? {} : { providerModel }),
        }),
        createdAt: nowIso(),
      },
      {
        id: createId("msg"),
        role: "system",
        content: buildAgentModePolicy(task.mode, locale),
        createdAt: nowIso(),
      },
      {
        id: createId("msg"),
        role: "system",
        content: buildPermissionSummary(locale),
        createdAt: nowIso(),
      },
      {
        id: createId("msg"),
        role: "system",
        content: buildModeExecutionSummary(session, locale, input.runFacts),
        createdAt: nowIso(),
      },
      ...(repoMapBlock
        ? [
            {
              id: createId("msg"),
              role: "system" as const,
              content: wrapUntrustedContent("repo-map", repoMapBlock, locale),
              createdAt: nowIso(),
            },
          ]
        : []),
      ...(
        buildPlanModeAttachment(session)
          ? [
              {
                id: createId("msg"),
                role: "system" as const,
                content: buildPlanModeAttachment(session) as string,
                createdAt: nowIso(),
              },
            ]
          : []
      ),
      ...(() => {
        const subagentBlock = buildSubagentDelegationBlock(
          task.mode,
          session.metadata?.subagent === true,
          profile,
          session.modelName,
        );
        return subagentBlock
          ? [
              {
                id: createId("msg"),
                role: "system" as const,
                content: subagentBlock,
                createdAt: nowIso(),
              },
            ]
          : [];
      })(),
      ...(projectRules.content
        ? [
            {
              id: createId("msg"),
              role: "system" as const,
              content: wrapUntrustedContent(
                projectRules.source ?? "project-rules",
                projectRules.content,
                locale,
              ),
              createdAt: nowIso(),
            },
          ]
        : []),
      ...(memoryItems.length > 0
        ? [
            {
              id: createId("msg"),
              role: "system" as const,
              content: wrapUntrustedContent(
                "memory",
                memoryItems.map((item) => item.content).join("\n"),
                locale,
              ),
              createdAt: nowIso(),
            },
          ]
        : []),
      ...session.messages,
      ...(
        typeof session.metadata?.compactionSummary === "string" &&
        session.metadata.compactionSummary.length > 0
          ? [
              {
                id: createId("msg"),
                role: "system" as const,
                content: `Compacted session summary:\n${session.metadata.compactionSummary}`,
                createdAt: nowIso(),
              },
            ]
          : []
      ),
    ];

    return {
      messages,
      metadata: {
        task: task.text,
        promptLocale: locale,
      },
    };
  }

  async addObservation(session: AgentSession, observation: Observation): Promise<void> {
    session.observations.push(observation);
    session.updatedAt = nowIso();
  }
}
