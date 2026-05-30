import { ToolRegistry } from "@code-mind/execution";
import type { ExtensionRegistry } from "./registry.js";

export function buildCapabilities(
  models: string[],
  toolRegistry: ToolRegistry,
  registry: ExtensionRegistry,
) {
  return registry.buildCapabilityManifest(
    models,
    toolRegistry.getSchemas().map((schema) => schema.name),
  );
}
