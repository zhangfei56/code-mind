import assert from "node:assert/strict";
import { ToolRegistry, registerDefaultTools } from "@code-mind/execution";
import type { AgentMode, Tool } from "@code-mind/shared";

const READ_TOOLS = [
  "read_file",
  "list_dir",
  "glob",
  "grep",
  "git_status",
  "git_diff",
  "git_log",
  "git_show",
  "lsp_diagnostics",
] as const;

const PLAN_ONLY_TOOLS = ["git_changed_files", "worktree_status", "worktree_diff"] as const;

const WRITE_TOOLS = [
  "apply_patch",
  "write_file",
  "search_replace",
  "delete_file",
  "move_file",
  "run_shell",
  "git_restore_file",
  "worktree_create",
  "worktree_cleanup",
] as const;

function schemaNames(registry: ToolRegistry, mode: AgentMode): string[] {
  return registry.getSchemasForMode(mode).map((schema) => schema.name);
}

export function runAgentModeRegistryTests(): void {
  const registry = new ToolRegistry();
  registerDefaultTools(registry);

  const askNames = schemaNames(registry, "ask");
  for (const name of READ_TOOLS) {
    assert.ok(askNames.includes(name), `TR-01: ask should expose ${name}`);
  }
  for (const name of [...PLAN_ONLY_TOOLS, ...WRITE_TOOLS]) {
    assert.ok(!askNames.includes(name), `TR-01: ask should not expose ${name}`);
  }

  const planNames = schemaNames(registry, "plan");
  for (const name of READ_TOOLS) {
    assert.ok(planNames.includes(name), `TR-02: plan should expose ${name}`);
  }
  for (const name of PLAN_ONLY_TOOLS) {
    assert.ok(planNames.includes(name), `TR-02: plan should expose ${name}`);
  }
  for (const name of WRITE_TOOLS) {
    assert.ok(!planNames.includes(name), `TR-02: plan should not expose ${name}`);
  }

  for (const mode of ["edit", "agent"] as const) {
    const names = schemaNames(registry, mode);
    for (const name of [...READ_TOOLS, ...PLAN_ONLY_TOOLS, ...WRITE_TOOLS]) {
      assert.ok(names.includes(name), `TR-03: ${mode} should expose ${name}`);
    }
  }

  const customTool: Tool = {
    name: "custom_mcp_tool",
    description: "custom",
    riskLevel: "low",
    schema: {
      name: "custom_mcp_tool",
      description: "custom",
      inputSchema: { type: "object", properties: {} },
    },
    async execute() {
      return { success: true, output: "ok" };
    },
  };
  registry.register(customTool);

  assert.ok(!schemaNames(registry, "ask").includes("custom_mcp_tool"), "TR-05");
  assert.ok(!schemaNames(registry, "plan").includes("custom_mcp_tool"), "TR-05");
  assert.ok(schemaNames(registry, "edit").includes("custom_mcp_tool"), "TR-05");
  assert.ok(schemaNames(registry, "agent").includes("custom_mcp_tool"), "TR-05");

  const askOnlyTool: Tool = {
    name: "ask_only_tool",
    description: "ask only",
    riskLevel: "low",
    availableInModes: ["ask"],
    schema: {
      name: "ask_only_tool",
      description: "ask only",
      inputSchema: { type: "object", properties: {} },
    },
    async execute() {
      return { success: true, output: "ok" };
    },
  };
  registry.register(askOnlyTool);
  assert.ok(schemaNames(registry, "ask").includes("ask_only_tool"), "TR-06");
  assert.ok(!schemaNames(registry, "edit").includes("ask_only_tool"), "TR-06");
}
