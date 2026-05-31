import { loadConfigForModel } from "@code-mind/config";
import type { AgentConfig } from "@code-mind/config";
import { createModelProvider } from "@code-mind/models";
import type { RuntimeDependencies } from "@code-mind/core";
import {
  resolveCompactionModelNameFromEnv,
  resolveCompactionPolicy,
  type CompactionPolicyOverrides,
} from "@code-mind/shared";

function compactionOverridesFromConfig(
  config?: AgentConfig,
): CompactionPolicyOverrides | undefined {
  if (!config?.compaction) {
    return undefined;
  }
  const { charThreshold, retainedMessages, retainedObservations, model } = config.compaction;
  if (
    charThreshold === undefined &&
    retainedMessages === undefined &&
    retainedObservations === undefined &&
    model === undefined
  ) {
    return undefined;
  }
  return {
    ...(charThreshold === undefined ? {} : { charThreshold }),
    ...(retainedMessages === undefined ? {} : { retainedMessages }),
    ...(retainedObservations === undefined ? {} : { retainedObservations }),
    ...(model === undefined ? {} : { modelName: model }),
  };
}

/** Composition helper: config + env compaction policy + optional dedicated compact model. */
export function buildCompactionRuntimeOverrides(
  runModelName: string,
  config?: AgentConfig,
): Pick<RuntimeDependencies, "compactionPolicy" | "compactionModel"> {
  const compactionPolicy = resolveCompactionPolicy(compactionOverridesFromConfig(config));
  const compactModelName = resolveCompactionModelNameFromEnv(compactionPolicy);
  if (!compactModelName || compactModelName === runModelName) {
    return { compactionPolicy };
  }

  try {
    const resolvedConfig = config ?? loadConfigForModel(compactModelName);
    return {
      compactionPolicy: { ...compactionPolicy, modelName: compactModelName },
      compactionModel: createModelProvider(resolvedConfig, compactModelName),
    };
  } catch {
    return { compactionPolicy };
  }
}
