import { DefaultContextManager } from "@code-mind/context";
import { ToolExecutor, ToolRegistry, registerDefaultTools } from "@code-mind/execution";
import { PermissionEngine, SafetyGuard } from "@code-mind/security";
import { ReviewEngine, VerificationPipeline } from "@code-mind/verify";
import { registerPlanModeTools } from "./plan-mode-tools.js";
import { createOrchestrationSessionStore } from "../session-store-factory.js";
import type { RuntimeDependencies } from "./types.js";

export function createDefaultToolRegistry(existing?: ToolRegistry): ToolRegistry {
  if (existing) {
    return existing;
  }
  const registry = new ToolRegistry();
  registerDefaultTools(registry);
  registerPlanModeTools(registry);
  return registry;
}

/** Default concrete implementations for composition roots (CLI, API, tests). */
export function createDefaultRuntimeDependencies(
  overrides: RuntimeDependencies = {},
): Required<
  Pick<
    RuntimeDependencies,
    | "contextManager"
    | "permissionEngine"
    | "safetyGuard"
    | "sessionStoreFactory"
    | "verificationPipeline"
    | "reviewEngine"
    | "toolRegistry"
  >
> &
  RuntimeDependencies {
  const { toolRegistry: overrideRegistry, ...restOverrides } = overrides;
  const toolRegistry = createDefaultToolRegistry(overrideRegistry);
  return {
    contextManager: overrides.contextManager ?? new DefaultContextManager(),
    permissionEngine: overrides.permissionEngine ?? new PermissionEngine(),
    safetyGuard: overrides.safetyGuard ?? new SafetyGuard(),
    sessionStoreFactory:
      overrides.sessionStoreFactory ??
      ((workspaceRoot: string) => createOrchestrationSessionStore(workspaceRoot)),
    verificationPipeline: overrides.verificationPipeline ?? new VerificationPipeline(),
    reviewEngine: overrides.reviewEngine ?? new ReviewEngine(),
    toolRegistry,
    ...restOverrides,
  };
}

export function createDefaultToolExecutor(deps: RuntimeDependencies): ToolExecutor {
  if (deps.toolExecutor) {
    return deps.toolExecutor;
  }
  return new ToolExecutor(createDefaultToolRegistry(deps.toolRegistry));
}
