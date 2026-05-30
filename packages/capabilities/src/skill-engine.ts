import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { AgentMode, SkillDefinition } from "@code-mind/shared";

function loadSkillDirectory(basePath: string): SkillDefinition[] {
  if (!existsSync(basePath)) {
    return [];
  }

  return readdirSync(basePath)
    .map((entry) => join(basePath, entry))
    .filter((path) => statSync(path).isDirectory())
    .map((path) => {
      const skillPath = join(path, "SKILL.md");
      if (!existsSync(skillPath)) {
        return null;
      }
      const manifestPath = join(path, "skill.yaml");
      const manifest = existsSync(manifestPath)
        ? (YAML.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>)
        : {};
      return {
        name: String(manifest.name ?? path.split("/").pop() ?? "skill"),
        description: String(manifest.description ?? readFileSync(skillPath, "utf8").split("\n")[0] ?? ""),
        path,
        content: readFileSync(skillPath, "utf8"),
        ...(manifest.tools === undefined
          ? {}
          : { tools: (manifest.tools as unknown[]).map(String) }),
        ...(manifest.allowed_modes === undefined
          ? {}
          : { allowedModes: (manifest.allowed_modes as AgentMode[]).map(String) as AgentMode[] }),
      } satisfies SkillDefinition;
    })
    .filter((value): value is SkillDefinition => value !== null);
}

export class SkillEngine {
  constructor(private readonly workspaceRoot: string) {}

  list(): SkillDefinition[] {
    const pluginBase = join(this.workspaceRoot, ".agent", "plugins");
    const pluginSkills = existsSync(pluginBase)
      ? readdirSync(pluginBase)
          .flatMap((plugin) => loadSkillDirectory(join(pluginBase, plugin, "skills")))
      : [];
    return [...loadSkillDirectory(join(this.workspaceRoot, ".agent", "skills")), ...pluginSkills];
  }

  get(name: string): SkillDefinition | undefined {
    return this.list().find((skill) => skill.name === name);
  }
}
