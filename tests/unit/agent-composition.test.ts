import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadComposedToolRegistry,
  loadWorkspaceExtensions,
  mergeExtensionRuntimeDeps,
} from "@code-mind/agent-composition";
import { createTestSessionStore } from "./helpers/session-store.js";
import { PermissionEngine } from "@code-mind/security";

export async function runAgentCompositionTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-composition-"));

  const { toolRegistry, extensions } = await loadComposedToolRegistry(workspace);
  assert.ok(toolRegistry.getSchemasForMode("ask").length > 0);
  const metadataOnly = await loadWorkspaceExtensions(workspace);
  assert.ok(metadataOnly.hookSystem);
  assert.ok(metadataOnly.skillEngine);

  const customEngine = new PermissionEngine();
  const deps = mergeExtensionRuntimeDeps(extensions, toolRegistry, {
    runtime: { permissionEngine: customEngine },
  });
  assert.equal(deps.permissionEngine, customEngine);
  assert.equal(deps.toolRegistry, toolRegistry);
  assert.equal(deps.hookSystem, extensions.hookSystem);
  assert.equal(deps.extensionRegistry, extensions.registry);

  const sessionStore = createTestSessionStore(workspace);
  assert.equal(typeof sessionStore.saveApproval, "function");
  assert.equal(typeof sessionStore.listSessionManifests, "function");
}
