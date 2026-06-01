import { mergeSkillRunPolicy, type LoadedExtensions } from "@code-mind/capabilities";
import {
  createDefaultRuntimeDependencies,
  type ClarifyPrompter,
  type PermissionPrompter,
  type SkillConfirmPrompter,
  type RuntimeDependencies,
} from "@code-mind/core";
import type { SkillRunPolicy } from "@code-mind/shared";
import type { ToolRegistry } from "@code-mind/execution";
/** Single merge point for extension wiring + composition overrides. */
export function mergeExtensionRuntimeDeps(
  extensions: LoadedExtensions,
  toolRegistry: ToolRegistry,
  options: {
    runtime?: RuntimeDependencies;
    permissionPrompter?: PermissionPrompter;
    clarifyPrompter?: ClarifyPrompter;
    skillConfirmPrompter?: SkillConfirmPrompter;
    skillRunPolicy?: SkillRunPolicy;
  } = {},
): ReturnType<typeof createDefaultRuntimeDependencies> {
  const skillRunPolicy = mergeSkillRunPolicy(
    extensions.skillRunPolicy,
    options.skillRunPolicy ?? options.runtime?.skillRunPolicy,
  );
  return createDefaultRuntimeDependencies({
    ...(options.runtime ?? {}),
    toolRegistry,
    hookSystem: extensions.hookSystem,
    subagentManager: extensions.subagentManager,
    extensionRegistry: extensions.registry,
    skillRunPolicy,
    ...(options.permissionPrompter === undefined
      ? {}
      : { permissionPrompter: options.permissionPrompter }),
    ...(options.clarifyPrompter === undefined
      ? {}
      : { clarifyPrompter: options.clarifyPrompter }),
    ...(options.skillConfirmPrompter === undefined
      ? {}
      : { skillConfirmPrompter: options.skillConfirmPrompter }),
  });
}
