import type { ExtensionSettings, SkillDefinition, SkillRunPolicy } from "@code-mind/shared";

export const DEFAULT_SKILL_RUN_POLICY: SkillRunPolicy = {
  mode: "auto",
  maxActive: 2,
};

export function skillPolicyFromSettings(settings: ExtensionSettings): SkillRunPolicy {
  const allowlist = settings.extensions?.skills?.enabled;
  return {
    ...DEFAULT_SKILL_RUN_POLICY,
    ...(allowlist === undefined || allowlist.length === 0 ? {} : { allowlist }),
  };
}

export function mergeSkillRunPolicy(
  base: SkillRunPolicy,
  overrides?: Partial<SkillRunPolicy>,
): SkillRunPolicy {
  if (!overrides) {
    return base;
  }
  const forceNames =
    overrides.forceNames !== undefined ? overrides.forceNames : base.forceNames;
  const mode = overrides.mode ?? base.mode;
  const exclusiveForce =
    overrides.exclusiveForce ??
    base.exclusiveForce ??
    (mode === "force" && (forceNames?.length ?? 0) > 0);

  const maxActive =
    overrides.maxActive ??
    (exclusiveForce && forceNames && forceNames.length > 0
      ? forceNames.length
      : base.maxActive ?? DEFAULT_SKILL_RUN_POLICY.maxActive!);

  return {
    ...base,
    ...overrides,
    mode,
    exclusiveForce,
    maxActive,
    ...(forceNames === undefined ? {} : { forceNames }),
  };
}

export function resolveSkillSelectorInput(policy: SkillRunPolicy): {
  enabledSkillNames?: string[];
  forceSkillNames?: string[];
  maxActive: number;
  exclusiveForce: boolean;
} {
  const forceNames = policy.forceNames?.filter((name) => name.length > 0);
  const exclusiveForce =
    policy.exclusiveForce === true ||
    (policy.mode === "force" && (forceNames?.length ?? 0) > 0);

  let enabledSkillNames: string[] | undefined;
  if (exclusiveForce && forceNames && forceNames.length > 0) {
    enabledSkillNames = forceNames;
  } else if (policy.allowlist && policy.allowlist.length > 0) {
    enabledSkillNames = policy.allowlist;
  }

  const maxActive =
    policy.maxActive ??
    (exclusiveForce && forceNames && forceNames.length > 0
      ? forceNames.length
      : DEFAULT_SKILL_RUN_POLICY.maxActive!);

  return {
    ...(enabledSkillNames === undefined ? {} : { enabledSkillNames }),
    ...(forceNames === undefined || forceNames.length === 0
      ? {}
      : { forceSkillNames: forceNames }),
    maxActive,
    exclusiveForce,
  };
}

export type RunSkillPolicyResolution =
  | { policy: SkillRunPolicy; forceNames: string[] }
  | { error: string };

/** Merge CLI `--skill` and slash-command `skill:` into a single force policy. */
export function resolveRunSkillPolicy(
  base: SkillRunPolicy,
  input: {
    cliSkillName?: string;
    commandSkillName?: string;
    lookupSkill: (name: string) => SkillDefinition | undefined;
  },
): RunSkillPolicyResolution {
  const forceNames: string[] = [];

  for (const rawName of [input.cliSkillName, input.commandSkillName]) {
    if (!rawName || rawName.length === 0) {
      continue;
    }
    const skill = input.lookupSkill(rawName);
    if (!skill) {
      return { error: `Unknown skill: ${rawName}` };
    }
    if (!forceNames.includes(skill.name)) {
      forceNames.push(skill.name);
    }
  }

  if (forceNames.length === 0) {
    return { policy: base, forceNames: [] };
  }

  return {
    policy: mergeSkillRunPolicy(base, {
      mode: "force",
      forceNames,
      maxActive: forceNames.length,
      exclusiveForce: true,
    }),
    forceNames,
  };
}
