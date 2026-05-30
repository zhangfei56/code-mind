import type { LoadedExtensions } from "@code-mind/capabilities";
import {
  createDefaultRuntimeDependencies,
  type PermissionPrompter,
  type RuntimeDependencies,
} from "@code-mind/core";
import type { ToolRegistry } from "@code-mind/execution";
/** Single merge point for extension wiring + composition overrides. */
export function mergeExtensionRuntimeDeps(
  extensions: LoadedExtensions,
  toolRegistry: ToolRegistry,
  options: {
    runtime?: RuntimeDependencies;
    permissionPrompter?: PermissionPrompter;
  } = {},
): ReturnType<typeof createDefaultRuntimeDependencies> {
  return createDefaultRuntimeDependencies({
    toolRegistry,
    hookSystem: extensions.hookSystem,
    subagentManager: extensions.subagentManager,
    extensionRegistry: extensions.registry,
    ...(options.runtime ?? {}),
    ...(options.permissionPrompter === undefined
      ? {}
      : { permissionPrompter: options.permissionPrompter }),
  });
}
