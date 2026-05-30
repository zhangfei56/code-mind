import { composeAgentLoop, type ComposedAgentLoop } from "@code-mind/agent-composition";
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
  } = {},
): Promise<ComposedAgentLoop> {
  return composeAgentLoop(workspaceRoot, {
    model,
    profile,
    ...(options.permissionPrompter === undefined
      ? {}
      : { permissionPrompter: options.permissionPrompter }),
    ...(options.runtime === undefined ? {} : { runtime: options.runtime }),
  });
}
