import type { AgentMode } from "@code-mind/shared";
import { ValidationError } from "@code-mind/shared";

export function resolveSkillMode(
  skill: { name: string; allowedModes?: AgentMode[] },
  mode: AgentMode,
  modeExplicit: boolean,
): AgentMode {
  if (modeExplicit) {
    if (
      skill.allowedModes &&
      skill.allowedModes.length > 0 &&
      !skill.allowedModes.includes(mode)
    ) {
      throw new ValidationError(
        `Skill "${skill.name}" does not support mode "${mode}". Allowed: ${skill.allowedModes.join(", ")}`,
      );
    }
    return mode;
  }
  return skill.allowedModes?.[0] ?? mode;
}
