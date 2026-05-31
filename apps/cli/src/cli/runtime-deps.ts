import { composeAgentLoop, buildCompactionRuntimeOverrides, type ComposedAgentLoop } from "@code-mind/agent-composition";
import type { AgentConfig } from "@code-mind/config";
import type { PermissionPrompter, RuntimeDependencies } from "@code-mind/core";
import type { AgentProfile, ModelProvider } from "@code-mind/shared";

/**
 * CLI composition root — thin wrapper over `composeAgentLoop` from `@code-mind/agent-composition`.
 * Apps should not duplicate extension loading or `createDefaultRuntimeDependencies` merges here.
 */
export async function createCliAgentLoop(
  workspaceRoot: string,
  model: ModelProvider,
  profile: AgentProfile,
  options: {
    permissionPrompter?: PermissionPrompter;
    runtime?: RuntimeDependencies;
    config?: AgentConfig;
    /** Config `models` key for the run model (defaults to `model.name`). */
    modelKey?: string;
  } = {},
): Promise<ComposedAgentLoop> {
  const modelKey = options.modelKey ?? model.name;
  return composeAgentLoop(workspaceRoot, {
    model,
    profile,
    ...(options.permissionPrompter === undefined
      ? {}
      : { permissionPrompter: options.permissionPrompter }),
    runtime: {
      ...buildCompactionRuntimeOverrides(modelKey, options.config),
      ...options.runtime,
    },
  });
}
