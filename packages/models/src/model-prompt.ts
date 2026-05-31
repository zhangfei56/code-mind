import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Mirrors OpenCode `session/system.ts` prompt keys. */
export type ModelPromptKey =
  | "beast"
  | "codex"
  | "gpt"
  | "gemini"
  | "anthropic"
  | "trinity"
  | "kimi"
  | "default";

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "prompts");

const promptCache = new Map<ModelPromptKey, string>();

function loadPromptFile(key: ModelPromptKey): string {
  const cached = promptCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const text = readFileSync(join(PROMPTS_DIR, `${key}.txt`), "utf8");
  promptCache.set(key, text);
  return text;
}

/** Normalize config key / provider selector to a single searchable model id. */
export function normalizeModelId(modelName?: string, providerModel?: string): string {
  const parts = [modelName, providerModel].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  if (parts.length === 0) {
    return "";
  }
  const combined = parts.join("/");
  const slashIndex = combined.indexOf(":");
  if (slashIndex > 0 && !combined.includes("/")) {
    return `${combined.slice(0, slashIndex)}/${combined.slice(slashIndex + 1)}`.toLowerCase();
  }
  return combined.toLowerCase();
}

/**
 * Port of OpenCode `SystemPrompt.provider()` routing
 * (`opencode/packages/opencode/src/session/system.ts`).
 */
export function resolveModelPromptKey(
  modelName?: string,
  providerModel?: string,
): ModelPromptKey {
  const id = normalizeModelId(modelName, providerModel);

  if (
    id.includes("gpt-4") ||
    id.includes("o1") ||
    id.includes("o3")
  ) {
    return "beast";
  }
  if (id.includes("gpt")) {
    if (id.includes("codex")) {
      return "codex";
    }
    return "gpt";
  }
  if (id.includes("gemini-")) {
    return "gemini";
  }
  if (id.includes("claude")) {
    return "anthropic";
  }
  if (id.includes("trinity")) {
    return "trinity";
  }
  if (id.includes("kimi")) {
    return "kimi";
  }
  return "default";
}

/** Light brand pass so legacy OpenCode strings read as code-mind if any remain. */
export function adaptPromptForCodeMind(text: string): string {
  return text
    .replaceAll("OpenCode", "code-mind")
    .replace(/\bopencode\b/gi, "code-mind");
}

export function getModelSpecificPrompt(
  modelName?: string,
  options: { providerModel?: string; adaptBrand?: boolean } = {},
): string {
  const key = resolveModelPromptKey(modelName, options.providerModel);
  const raw = loadPromptFile(key);
  return options.adaptBrand === false ? raw : adaptPromptForCodeMind(raw);
}
