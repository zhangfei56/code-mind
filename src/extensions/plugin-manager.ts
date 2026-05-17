import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import YAML from "yaml";
import type { PluginDefinition } from "../shared/types.js";

interface PluginState {
  enabled: string[];
}

function readPluginState(workspaceRoot: string): PluginState {
  const statePath = join(workspaceRoot, ".agent", "plugin-state.json");
  if (!existsSync(statePath)) {
    return { enabled: [] };
  }
  return JSON.parse(readFileSync(statePath, "utf8")) as PluginState;
}

function writePluginState(workspaceRoot: string, state: PluginState): void {
  mkdirSync(join(workspaceRoot, ".agent"), { recursive: true });
  writeFileSync(
    join(workspaceRoot, ".agent", "plugin-state.json"),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8",
  );
}

export class PluginManager {
  constructor(private readonly workspaceRoot: string) {}

  install(sourcePath: string): PluginDefinition {
    const absoluteSource = resolve(this.workspaceRoot, sourcePath);
    const pluginYamlPath = join(absoluteSource, "plugin.yaml");
    const raw = YAML.parse(readFileSync(pluginYamlPath, "utf8")) as Record<string, unknown>;
    const name = String(raw.name ?? basename(absoluteSource));
    const targetDir = join(this.workspaceRoot, ".agent", "plugins", name);
    mkdirSync(join(this.workspaceRoot, ".agent", "plugins"), { recursive: true });
    cpSync(absoluteSource, targetDir, { recursive: true });
    return this.parse(targetDir, false);
  }

  list(): PluginDefinition[] {
    const baseDir = join(this.workspaceRoot, ".agent", "plugins");
    if (!existsSync(baseDir)) {
      return [];
    }
    const state = readPluginState(this.workspaceRoot);
    return readdirSync(baseDir)
      .map((entry) => this.parse(join(baseDir, entry), state.enabled.includes(entry)));
  }

  enable(name: string): void {
    const state = readPluginState(this.workspaceRoot);
    if (!state.enabled.includes(name)) {
      state.enabled.push(name);
    }
    writePluginState(this.workspaceRoot, state);
  }

  disable(name: string): void {
    const state = readPluginState(this.workspaceRoot);
    state.enabled = state.enabled.filter((entry) => entry !== name);
    writePluginState(this.workspaceRoot, state);
  }

  remove(name: string): void {
    rmSync(join(this.workspaceRoot, ".agent", "plugins", name), {
      recursive: true,
      force: true,
    });
    this.disable(name);
  }

  private parse(pluginPath: string, enabled: boolean): PluginDefinition {
    const raw = YAML.parse(readFileSync(join(pluginPath, "plugin.yaml"), "utf8")) as Record<string, unknown>;
    return {
      name: String(raw.name ?? basename(pluginPath)),
      version: String(raw.version ?? "0.1.0"),
      description: String(raw.description ?? ""),
      path: pluginPath,
      ...(raw.skills === undefined ? {} : { skills: (raw.skills as unknown[]).map((item) => String((item as { path?: string }).path ?? item)) }),
      ...(raw.agents === undefined ? {} : { agents: (raw.agents as unknown[]).map((item) => String((item as { path?: string }).path ?? item)) }),
      ...(raw.hooks === undefined
        ? {}
        : {
            hooks: (raw.hooks as unknown[]).map(
              (item) => item as { event: import("../shared/types.js").HookEvent; path: string },
            ),
          }),
      ...(raw.commands === undefined
        ? {}
        : {
            commands: (raw.commands as unknown[]).map(
              (item) => item as { name: string; path: string },
            ),
          }),
      ...(raw.permissions === undefined ? {} : { permissions: raw.permissions as Record<string, unknown> }),
      enabled,
    };
  }
}
