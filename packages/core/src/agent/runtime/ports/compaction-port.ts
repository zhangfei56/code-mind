import { buildCompactionMergeMessages, buildCompactionSummarizeInput } from "@code-mind/context";
import type {
  AgentSession,
  CompactionPolicy,
  CompactionSummarizeInput,
  CompactionSummarizeOptions,
  CompactionSummarizeResult,
  ModelProvider,
} from "@code-mind/shared";
import { DEFAULT_COMPACTION_POLICY } from "@code-mind/shared";

export interface CompactionPort {
  summarize(
    input: CompactionSummarizeInput,
    options?: CompactionSummarizeOptions,
  ): Promise<CompactionSummarizeResult>;
}

export function createCompactionPort(
  model: ModelProvider,
  _policy: CompactionPolicy = DEFAULT_COMPACTION_POLICY,
): CompactionPort {
  return {
    async summarize(
      input: CompactionSummarizeInput,
      options?: CompactionSummarizeOptions,
    ): Promise<CompactionSummarizeResult> {
      const started = Date.now();
      const response = await model.chat({
        messages: buildCompactionMergeMessages(input),
        tools: [],
        temperature: 0,
        maxTokens: 4096,
        metadata: { purpose: "compaction" },
        ...(options?.abortSignal === undefined
          ? {}
          : { abortSignal: options.abortSignal }),
      });
      const summaryMarkdown = response.text.trim();
      if (!summaryMarkdown) {
        throw new Error("Compaction model returned empty summary.");
      }

      return {
        summaryMarkdown,
        strategy: "llm",
        modelName: model.name,
        durationMs: Date.now() - started,
        ...(response.usage === undefined ? {} : { usage: response.usage }),
      };
    },
  };
}

export function buildCompactionInputFromSession(
  session: AgentSession,
  policy: CompactionPolicy = DEFAULT_COMPACTION_POLICY,
): CompactionSummarizeInput {
  return buildCompactionSummarizeInput(session, policy);
}
