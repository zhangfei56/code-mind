import type { SkillDefinition } from "@code-mind/shared";

const recallTokenCache = new WeakMap<SkillDefinition, Set<string>>();

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 2),
  );
}

export function getSkillRecallTokens(skill: SkillDefinition): Set<string> {
  const cached = recallTokenCache.get(skill);
  if (cached) {
    return cached;
  }
  const bodyPreview = skill.content
    .replace(/^#\s+.*$/m, "")
    .split("\n")
    .slice(0, 12)
    .join(" ");
  const tokens = tokenize(`${skill.name} ${skill.description} ${bodyPreview}`);
  recallTokenCache.set(skill, tokens);
  return tokens;
}

/** Cached token overlap for skill recall (CTX-02 baseline without embeddings). */
export function recallSimilarity(taskText: string, skill: SkillDefinition): number {
  const taskTokens = tokenize(taskText);
  const skillTokens = getSkillRecallTokens(skill);
  if (skillTokens.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of skillTokens) {
    if (taskTokens.has(token)) {
      overlap += 1;
    }
  }
  return Math.min(40, Math.round((overlap / skillTokens.size) * 40));
}
