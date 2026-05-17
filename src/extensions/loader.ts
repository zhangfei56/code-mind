import { join } from "node:path";
import { ExtensionRegistry } from "./registry.js";
import { SkillEngine } from "./skill-engine.js";
import { CommandSystem } from "./command-system.js";
import { SubagentManager } from "./subagent-manager.js";
import { PluginManager } from "./plugin-manager.js";
import { loadExtensionSettings } from "./settings.js";
import { McpAdapter } from "./mcp-adapter.js";
import { HookSystem } from "./hook-system.js";
import { ToolRegistry } from "../tools/registry.js";

export interface LoadedExtensions {
  registry: ExtensionRegistry;
  skillEngine: SkillEngine;
  commandSystem: CommandSystem;
  subagentManager: SubagentManager;
  pluginManager: PluginManager;
  hookSystem: HookSystem;
  mcpAdapter: McpAdapter;
}

export async function loadExtensions(
  workspaceRoot: string,
  toolRegistry?: ToolRegistry,
): Promise<LoadedExtensions> {
  const settings = loadExtensionSettings(workspaceRoot);
  const registry = new ExtensionRegistry();
  const skillEngine = new SkillEngine(workspaceRoot);
  const commandSystem = new CommandSystem(workspaceRoot);
  const subagentManager = new SubagentManager(workspaceRoot);
  const pluginManager = new PluginManager(workspaceRoot);
  const mcpAdapter = new McpAdapter();

  for (const skill of skillEngine.list()) {
    registry.registerSkill(skill);
  }
  for (const command of commandSystem.list()) {
    registry.registerCommand(command);
  }
  for (const agent of subagentManager.list()) {
    registry.registerSubagent(agent);
  }
  for (const plugin of pluginManager.list()) {
    registry.registerPlugin(plugin);
    for (const hook of plugin.hooks ?? []) {
      registry.registerHook(hook.event, {
        name: `${plugin.name}:${hook.event}`,
        type: "script",
        path: join(plugin.path, hook.path),
      });
    }
  }
  for (const [event, hooks] of Object.entries(settings.hooks ?? {})) {
    for (const hook of hooks ?? []) {
      registry.registerHook(event, hook);
    }
  }
  for (const [name, server] of Object.entries(settings.mcp?.servers ?? {})) {
    registry.registerMcpServer(name, server);
    if (toolRegistry) {
      try {
        const tools = await mcpAdapter.listTools(name, server, workspaceRoot);
        for (const tool of tools) {
          toolRegistry.register(tool);
        }
      } catch {
        // Defer MCP startup errors until explicit use.
      }
    }
  }

  return {
    registry,
    skillEngine,
    commandSystem,
    subagentManager,
    pluginManager,
    hookSystem: new HookSystem(settings.hooks ?? {}, workspaceRoot),
    mcpAdapter,
  };
}
