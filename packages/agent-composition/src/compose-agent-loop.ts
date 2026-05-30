import {
  createRunSubagentTool,
  loadExtensions,
  type LoadedExtensions,
  type SubagentLoopHostFactory,
} from "@code-mind/capabilities";
import {
  AgentLoopController,
  createAgentLoopController,
  createAgentLoopRuntimeWiring,
  createDefaultToolRegistry,
  type PermissionPrompter,
  type RuntimeDependencies,
} from "@code-mind/core";
import type { ToolRegistry } from "@code-mind/execution";
import type { AgentProfile, ModelProvider } from "@code-mind/shared";
import { mergeExtensionRuntimeDeps } from "./merge-extension-runtime-deps.js";

export type { LoadedExtensions } from "@code-mind/capabilities";

export interface ComposeAgentLoopOptions {
  permissionPrompter?: PermissionPrompter;
  model?: ModelProvider;
  profile?: AgentProfile;
  /** Partial runtime overrides merged after extensions + default deps (single merge point). */
  runtime?: RuntimeDependencies;
  /** Skip `loadExtensions` when CLI/API already loaded workspace extensions into `toolRegistry`. */
  extensions?: LoadedExtensions;
  toolRegistry?: ToolRegistry;
}

export interface ComposedAgentLoop {
  loop: AgentLoopController;
  toolRegistry: ToolRegistry;
  extensions: LoadedExtensions;
}

/** Load extensions once into a default tool registry (composition helper for CLI run path). */
export async function loadComposedToolRegistry(
  workspaceRoot: string,
  existingRegistry?: ToolRegistry,
): Promise<{ toolRegistry: ToolRegistry; extensions: LoadedExtensions }> {
  const toolRegistry = createDefaultToolRegistry(existingRegistry);
  const extensions = await loadExtensions(workspaceRoot, toolRegistry);
  return { toolRegistry, extensions };
}

/**
 * Product composition: load workspace extensions, wire default runtime deps, optional subagent tool.
 * Used by CLI / API composition roots — not part of @code-mind/core loop contract.
 */
export async function composeAgentLoop(
  workspaceRoot: string,
  options: ComposeAgentLoopOptions = {},
): Promise<ComposedAgentLoop> {
  const toolRegistry =
    options.toolRegistry ?? createDefaultToolRegistry(options.runtime?.toolRegistry);
  const extensions =
    options.extensions ?? (await loadExtensions(workspaceRoot, toolRegistry));

  const runtimeDeps = mergeExtensionRuntimeDeps(extensions, toolRegistry, options);
  const loop = createAgentLoopController(runtimeDeps);

  if (options.model && options.profile) {
    const hostFactory: SubagentLoopHostFactory = {
      getHost(scoped) {
        if (!scoped?.toolRegistry) {
          return loop;
        }
        return new AgentLoopController(
          createAgentLoopRuntimeWiring(
            mergeExtensionRuntimeDeps(extensions, scoped.toolRegistry, options),
          ),
        );
      },
    };
    toolRegistry.register(
      createRunSubagentTool(
        workspaceRoot,
        extensions.subagentManager,
        hostFactory,
        options.model,
        options.profile,
        toolRegistry,
      ),
    );
  }

  return { loop, toolRegistry, extensions };
}
