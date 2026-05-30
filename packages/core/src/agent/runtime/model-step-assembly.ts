import type { ExtensionRegistry } from "@code-mind/capabilities";
import {
  injectCapabilityContextBlocks,
  selectModelCapabilities,
} from "@code-mind/capabilities";
import type {
  AgentSession,
  InternalMessage,
  RuntimeInput,
  SelectedCapabilities,
} from "@code-mind/shared";
import { createId, nowIso } from "@code-mind/shared";
import type { ToolRegistry } from "@code-mind/execution";
import { shouldEnterClosingTurn, type LoopPolicy } from "../task-strategy.js";
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

  const toolSchemaSelection = selectToolSchemasForModel(deps.toolRegistry, runState, {
    enterClosingTurn,
  });
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
