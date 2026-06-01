import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { Tool } from "@code-mind/shared";
import { READ_TOOLS_MODES } from "@code-mind/shared";
import { sanitizeToolOutput, truncateToolOutput } from "./output.js";

const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

interface ReadSkillArgs {
  name: string;
  file?: string;
}

function isAllowedSkillRelativePath(relativePath: string): boolean {
  if (relativePath === "SKILL.md") {
    return true;
  }
  return relativePath.startsWith("references/") && relativePath.endsWith(".md");
}

function resolveSkillFilePath(workspaceRoot: string, name: string, file: string): string | null {
  if (!SKILL_NAME_PATTERN.test(name)) {
    return null;
  }
  const normalizedFile = file.replace(/\\/g, "/");
  const skillRoot = resolve(workspaceRoot, ".agent", "skills", name);
  const target = resolve(skillRoot, normalizedFile);
  if (!target.startsWith(skillRoot)) {
    return null;
  }
  const rel = relative(skillRoot, target).replace(/\\/g, "/");
  if (!isAllowedSkillRelativePath(rel)) {
    return null;
  }
  return target;
}

const readSkillDescription =
  "Read a workspace skill file from .agent/skills/<name>/ (SKILL.md or references/*.md).";

export const readSkillTool: Tool<ReadSkillArgs> = {
  name: "read_skill",
  description: readSkillDescription,
  riskLevel: "low",
  availableInModes: READ_TOOLS_MODES,
  schema: {
    name: "read_skill",
    description: readSkillDescription,
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Skill directory name under .agent/skills/.",
        },
        file: {
          type: "string",
          description: 'Relative file path (default "SKILL.md", or "references/...").',
        },
      },
      required: ["name"],
    },
  },
  async execute(args, context) {
    const file = args.file ?? "SKILL.md";
    const target = resolveSkillFilePath(context.workspaceRoot, args.name, file);
    if (!target) {
      return {
        success: false,
        output: "",
        error: "Invalid skill name or file path.",
      };
    }

    try {
      const content = await readFile(target, "utf8");
      return {
        success: true,
        output: truncateToolOutput(sanitizeToolOutput(content)),
      };
    } catch {
      return {
        success: false,
        output: "",
        error: `Skill file not found: ${args.name}/${file}`,
      };
    }
  },
};
