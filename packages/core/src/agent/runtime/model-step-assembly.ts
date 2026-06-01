import type { ExtensionRegistry } from "@code-mind/capabilities";
import {
  DEFAULT_SKILL_RUN_POLICY,
  injectCapabilityContextBlocks,
  resolveSkillSelectorInput,
  selectModelCapabilities,
} from "@code-mind/capabilities";
import type {
  AgentSession,
  InternalMessage,
  RuntimeInput,
  SelectedCapabilities,
  SkillRunPolicy,
} from "@code-mind/shared";
import { createId, nowIso } from "@code-mind/shared";
import type { ToolRegistry } from "@code-mind/execution";
import { resolveProductPromptLocale } from "@code-mind/models";
import { shouldEnterClosingTurn, shouldGateFileMutations, type LoopPolicy } from "../task-strategy.js";
import { buildScopeControlGuidance, needsScopeControl } from "../task-clarity.js";
import { getEffectiveMaxSteps } from "./run-state.js";
import { setActivity } from "./run-facts.js";
import type { RunState } from "./run-state.js";
import { selectToolSchemasForModel } from "./tool-schema-selection.js";
import { closingTurnStartedEvent } from "./agent-events.js";

export interface StepAssembly {
  messages: InternalMessage[];
  enterClosingTurn: boolean;
  selectedCapabilities: SelectedCapabilities;
  streamContent: boolean;
}

export async function buildStepAssembly(
  deps: {
    getPromptAssembly: () => import("../kernel/ports.js").PromptAssemblyPort;
    extensionRegistry?: ExtensionRegistry;
    skillRunPolicy?: SkillRunPolicy;
    toolRegistry: ToolRegistry;
    publish: (
      input: RuntimeInput | undefined,
      event: import("@code-mind/shared").AgentEventInput,
    ) => Promise<void>;
  },
  params: {
    session: AgentSession;
    input: RuntimeInput;
    runState: RunState;
    strategy: LoopPolicy;
    stepNumber: number;
  },
): Promise<StepAssembly> {
  const { session, input, runState, strategy, stepNumber } = params;
  const context = await deps.getPromptAssembly().assemble(input, runState);

  const enterClosingTurn = shouldEnterClosingTurn({
    policy: strategy,
    step: stepNumber,
    maxSteps: getEffectiveMaxSteps(runState),
    modifiedFilesCount: runState.progress.modifiedFiles.size,
    hasVerificationResult: runState.verification.lastVerification !== undefined,
    verificationFailed: runState.verification.lastVerification?.passed === false,
    evidence: runState.exploration.evidence,
  });

  const maxSteps = getEffectiveMaxSteps(runState);

  if (enterClosingTurn && !runState.progress.closingTurn) {
    runState.progress.closingTurn = true;
    setActivity(runState.progress, "summarizing");
    await deps.publish(
      input,
      closingTurnStartedEvent(
        stepNumber,
        stepNumber >= maxSteps ? "budget" : "policy",
      ),
    );
    context.messages = [
      ...context.messages,
      {
        id: createId("msg"),
        role: "system",
        content: strategy.forceNarrowingAfterBudget
          ? "You have reached the exploration budget. Do not continue broad exploration. Do not call any more tools. Summarize the most likely root cause or highest-value next target based on current evidence, list what was verified, and give the next single concrete file or command to inspect if the task is incomplete."
          : "You are at the end of the allowed step budget. Do not call any more tools. Summarize the current findings, what was changed, what was verified, and the next most useful action if the task is incomplete.",
        createdAt: nowIso(),
      },
    ];
  }

  const locale = resolveProductPromptLocale(
    session.modelName,
    typeof input.profile.metadata?.providerModel === "string"
      ? input.profile.metadata.providerModel
      : undefined,
  );
  if (
    needsScopeControl(input.task, session.workspaceRoot) &&
    !runState.progress.scopeControlInjected
  ) {
    runState.progress.scopeControlInjected = true;
    context.messages = [
      ...context.messages,
      {
        id: createId("msg"),
        role: "system",
        content: buildScopeControlGuidance(input.task, session.workspaceRoot, locale),
        createdAt: nowIso(),
      },
    ];
  }

  const writeToolsGated = shouldGateFileMutations({
    task: input.task,
    workspaceRoot: session.workspaceRoot,
    policy: strategy,
    evidence: runState.exploration.evidence,
    modifiedFilesCount: runState.progress.modifiedFiles.size,
  });
  if (writeToolsGated) {
    context.messages = [
      ...context.messages,
      {
        id: createId("msg"),
        role: "system",
        content:
          locale === "zh"
            ? "探索阶段：文件修改工具已暂时禁用。请先 list_dir / read_file / grep，并运行验证命令确认失败位置；满足探索证据后再改代码。"
            : "Exploration phase: file mutation tools are temporarily disabled. Use list_dir, read_file, grep, and run verification first; edit only after the failure location is confirmed.",
        createdAt: nowIso(),
      },
    ];
  }

  const toolSchemaSelection = selectToolSchemasForModel(deps.toolRegistry, runState, {
    enterClosingTurn,
    task: input.task,
    workspaceRoot: session.workspaceRoot,
    strategy,
  });
  const skillSelector = resolveSkillSelectorInput(
    deps.skillRunPolicy ?? DEFAULT_SKILL_RUN_POLICY,
  );
  const confirmedSkillNames = Array.isArray(input.task.metadata?.confirmedSkillNames)
    ? input.task.metadata.confirmedSkillNames.map(String)
    : undefined;
  const selectedCapabilities = selectModelCapabilities({
    capability: {
      taskText: input.task.text,
      mode: runState.planMode.active ? "plan" : runState.progress.mode,
      skills: deps.extensionRegistry?.listSkills() ?? [],
      plugins: (deps.extensionRegistry?.listPlugins() ?? []).map((plugin) => ({
        name: plugin.name,
        description: plugin.description,
        ...(plugin.enabled === undefined ? {} : { enabled: plugin.enabled }),
        ...(plugin.skills === undefined ? {} : { skills: plugin.skills }),
      })),
      enterClosingTurn,
      ...skillSelector,
      ...(confirmedSkillNames === undefined || confirmedSkillNames.length === 0
        ? {}
        : { confirmedSkillNames }),
    },
    toolSelection: {
      tools: toolSchemaSelection.tools,
      trigger: toolSchemaSelection.trigger,
      reason: toolSchemaSelection.reason,
    },
  });
  const streamContent = selectedCapabilities.toolSchemas.length === 0;

  const messages = injectCapabilityContextBlocks(
    context.messages,
    selectedCapabilities.contextBlocks,
    (content) => ({
      id: createId("msg"),
      role: "system" as const,
      content,
      createdAt: nowIso(),
    }),
  );

  return {
    messages,
    enterClosingTurn,
    selectedCapabilities,
    streamContent,
  };
}
