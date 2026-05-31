import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeModelId } from "./model-prompt.js";

export type ProductPromptLocale = "zh" | "en";

const PRODUCT_PROMPTS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "prompts",
  "product",
);

const productPromptCache = new Map<string, string>();

/** Route product-layer copy by model family (strategy C). */
export function resolveProductPromptLocale(
  modelName?: string,
  providerModel?: string,
): ProductPromptLocale {
  const id = normalizeModelId(modelName, providerModel);
  if (
    id.includes("gpt") ||
    id.includes("claude") ||
    id.includes("gemini-") ||
    id.includes("o1") ||
    id.includes("o3") ||
    id.includes("trinity")
  ) {
    return "en";
  }
  return "zh";
}

export function renderPromptTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => variables[key] ?? "");
}

function loadProductPromptFile(name: string, locale: ProductPromptLocale): string {
  const cacheKey = `${name}.${locale}`;
  const cached = productPromptCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const text = readFileSync(join(PRODUCT_PROMPTS_DIR, `${cacheKey}.txt`), "utf8");
  productPromptCache.set(cacheKey, text);
  return text;
}

export function getProductPrompt(
  name: string,
  locale: ProductPromptLocale,
  variables: Record<string, string> = {},
): string {
  const raw = loadProductPromptFile(name, locale);
  return renderPromptTemplate(raw, variables).trimEnd();
}

export interface ModelEnvironmentPromptOptions {
  modelName: string;
  providerModel?: string;
  workspaceRoot: string;
  cwd: string;
  isGitRepo?: boolean;
  locale?: ProductPromptLocale;
  /** Stable calendar date for the session (defaults to today if omitted). */
  referenceDate?: string;
}

export function getModelEnvironmentPrompt(
  options: ModelEnvironmentPromptOptions,
): string {
  const locale =
    options.locale ??
    resolveProductPromptLocale(options.modelName, options.providerModel);
  const modelId =
    normalizeModelId(options.modelName, options.providerModel) || options.modelName;
  const date =
    options.referenceDate !== undefined && options.referenceDate.length > 0
      ? options.referenceDate
      : new Date().toDateString();
  return getProductPrompt("env", locale, {
    modelName: options.modelName,
    modelId,
    cwd: options.cwd,
    workspaceRoot: options.workspaceRoot,
    isGitRepo: options.isGitRepo === true ? "yes" : "no",
    platform: process.platform,
    date,
  });
}
