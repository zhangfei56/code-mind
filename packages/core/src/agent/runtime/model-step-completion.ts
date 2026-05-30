import type {
  AgentResult,
  AgentSession,
  InternalMessage,
  RuntimeInput,
} from "@code-mind/shared";
import { createId, nowIso } from "@code-mind/shared";
import { buildFallbackFinalText } from "./helpers.js";
import { addTokenUsage } from "./run-state.js";
import type { RunState } from "./run-state.js";
import type { ModelStepDeps } from "./model-step.js";

const SUMMARY_RETRY_PROMPT =
  "You must respond with a plain-text final summary now. Do not call tools. Summarize findings, changes, verification, and next steps.";

export async function resolveTerminalText(
  deps: Pick<ModelStepDeps, "resultBuilder" | "finalize" | "getModelPort">,
  params: {
    session: AgentSession;
    input: RuntimeInput;
    runState: RunState;
    step: number;
    responseText: string;
    forceSummary: boolean;
    summaryMessages: InternalMessage[];
  },
): Promise<AgentResult> {
  const { session, input, runState, step, forceSummary, summaryMessages } = params;
  let text = params.responseText.trim();

  if (!text && !forceSummary) {
    const retryResponse = await deps.getModelPort(input.model).call({
      messages: [
        ...summaryMessages,
        {
          id: createId("msg"),
          role: "system",
          content: SUMMARY_RETRY_PROMPT,
          createdAt: nowIso(),
        },
      ],
      tools: [],
      ...(input.abortSignal === undefined ? {} : { abortSignal: input.abortSignal }),
    });
    text = retryResponse.text.trim();
    if (retryResponse.usage) {
      addTokenUsage(runState.usage, retryResponse.usage);
    }
  }

  if (text.length > 0) {
    return deps.finalize(
      deps.resultBuilder.success(session.id, input.model.name, step + 1, text),
      runState,
    );
  }

  return deps.finalize(
    deps.resultBuilder.incomplete(
      session.id,
      input.model.name,
      step + 1,
      buildFallbackFinalText(session, runState),
    ),
    runState,
  );
}
