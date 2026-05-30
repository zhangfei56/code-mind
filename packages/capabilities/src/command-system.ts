import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { CommandDefinition, AgentMode } from "@code-mind/shared";

function loadCommandFile(basePath: string): CommandDefinition[] {
  if (!existsSync(basePath)) {
    return [];
  }

  return readdirSync(basePath)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const path = join(basePath, file);
      const name = file.replace(/\.md$/, "");
      const manifestPath = join(basePath, `${name}.yaml`);
      const manifest = existsSync(manifestPath)
        ? (YAML.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>)
        : {};
      return {
        name: String(manifest.name ?? name),
        description: String(manifest.description ?? `Command ${name}`),
        path,
        content: readFileSync(path, "utf8"),
        ...(manifest.mode === undefined ? {} : { mode: String(manifest.mode) as AgentMode }),
        ...(manifest.skill === undefined ? {} : { skill: String(manifest.skill) }),
        ...(manifest.tools === undefined ? {} : { tools: (manifest.tools as unknown[]).map(String) }),
      } satisfies CommandDefinition;
    });
}

export class CommandSystem {
  constructor(private readonly workspaceRoot: string) {}

  list(): CommandDefinition[] {
    const pluginBase = join(this.workspaceRoot, ".agent", "plugins");
    const pluginCommands = existsSync(pluginBase)
      ? readdirSync(pluginBase)
          .flatMap((plugin) => loadCommandFile(join(pluginBase, plugin, "commands")))
      : [];
    return [...loadCommandFile(join(this.workspaceRoot, ".agent", "commands")), ...pluginCommands];
  }

  get(name: string): CommandDefinition | undefined {
    const normalized = name.startsWith("/") ? name.slice(1) : name;
    return this.list().find((command) => command.name === normalized);
  }
}
