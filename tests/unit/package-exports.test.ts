import assert from "node:assert/strict";

/** Smoke: every workspace package main export loads and exposes expected surface. */
export async function runPackageExportsTests(): Promise<void> {
  const shared = await import("@code-mind/shared");
  assert.equal(typeof shared.createId, "function");
  assert.equal(typeof shared.parsePatch, "function");

  const config = await import("@code-mind/config");
  assert.equal(typeof config.loadConfig, "function");

  const memory = await import("@code-mind/memory");
  assert.equal(typeof memory.NoopMemoryProvider, "function");

  const workspace = await import("@code-mind/workspace");
  assert.equal(typeof workspace.resolveWorkspace, "function");

  const security = await import("@code-mind/security");
  assert.equal(typeof security.PermissionEngine, "function");

  const models = await import("@code-mind/models");
  assert.equal(typeof models.createModelProvider, "function");

  const context = await import("@code-mind/context");
  assert.equal(typeof context.DefaultContextManager, "function");

  const execution = await import("@code-mind/execution");
  assert.equal(typeof execution.ToolRegistry, "function");

  const observability = await import("@code-mind/observability");
  assert.equal(typeof observability.createEventBus, "function");

  const session = await import("@code-mind/session");
  assert.equal(typeof session.FileSessionStore, "function");

  const verify = await import("@code-mind/verify");
  assert.equal(typeof verify.VerificationPipeline, "function");

  const capabilities = await import("@code-mind/capabilities");
  assert.equal(typeof capabilities.selectCapabilities, "function");

  const core = await import("@code-mind/core");
  assert.equal(typeof core.runAgentSession, "function");
  assert.equal(typeof core.composeAgentLoop, "undefined");

  const composition = await import("@code-mind/agent-composition");
  assert.equal(typeof composition.composeAgentLoop, "function");

  const serverRuntime = await import("@code-mind/server-runtime");
  assert.equal(typeof serverRuntime.AsyncRunManager, "function");
}
