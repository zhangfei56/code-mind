import type {
  CapabilityManifest,
  CommandDefinition,
  HookDefinition,
  McpServerConfig,
  PluginDefinition,
  SkillDefinition,
  SubagentDefinition,
} from "@code-mind/shared";

export class ExtensionRegistry {
  private readonly skills = new Map<string, SkillDefinition>();
  private readonly subagents = new Map<string, SubagentDefinition>();
  private readonly hooks = new Map<string, HookDefinition>();
  private readonly commands = new Map<string, CommandDefinition>();
  private readonly mcpServers = new Map<string, McpServerConfig>();
  private readonly plugins = new Map<string, PluginDefinition>();

  registerSkill(skill: SkillDefinition): void {
    this.skills.set(skill.name, skill);
  }

  registerSubagent(agent: SubagentDefinition): void {
    this.subagents.set(agent.name, agent);
  }

  registerHook(event: string, hook: HookDefinition): void {
    this.hooks.set(`${event}:${hook.name}`, hook);
  }

  registerCommand(command: CommandDefinition): void {
    this.commands.set(command.name, command);
  }

  registerMcpServer(name: string, server: McpServerConfig): void {
    this.mcpServers.set(name, server);
  }

  registerPlugin(plugin: PluginDefinition): void {
    this.plugins.set(plugin.name, plugin);
  }

  listSkills(): SkillDefinition[] {
    return [...this.skills.values()];
  }

  listSubagents(): SubagentDefinition[] {
    return [...this.subagents.values()];
  }

  listHooks(): HookDefinition[] {
    return [...this.hooks.values()];
  }

  listCommands(): CommandDefinition[] {
    return [...this.commands.values()];
  }

  listMcpServers(): Array<{ name: string; config: McpServerConfig }> {
    return [...this.mcpServers.entries()].map(([name, config]) => ({ name, config }));
  }

  listPlugins(): PluginDefinition[] {
    return [...this.plugins.values()];
  }

  getSkill(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  getSubagent(name: string): SubagentDefinition | undefined {
    return this.subagents.get(name);
  }

  getCommand(name: string): CommandDefinition | undefined {
    return this.commands.get(name);
  }

  buildCapabilityManifest(models: string[], tools: string[]): CapabilityManifest {
    return {
      models,
      tools,
      mcpServers: [...this.mcpServers.keys()],
      skills: [...this.skills.keys()],
      subagents: [...this.subagents.keys()],
      hooks: [...this.hooks.values()].map((hook) => hook.name),
      commands: [...this.commands.keys()],
      plugins: [...this.plugins.keys()],
    };
  }
}
