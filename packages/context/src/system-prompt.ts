import {
  getProductPrompt,
  resolveProductPromptLocale,
  type ProductPromptLocale,
} from "@code-mind/models";

interface RuntimePromptOptions {
  modelName: string;
  workspaceRoot: string;
  cwd: string;
  providerModel?: string;
  locale?: ProductPromptLocale;
}

export function createRuntimeSystemPrompt(
  basePrompt: string,
  options: RuntimePromptOptions,
): string {
  const locale =
    options.locale ?? resolveProductPromptLocale(options.modelName, options.providerModel);
  const runtimeRules = getProductPrompt("runtime", locale);

  return [basePrompt, "", runtimeRules].join("\n");
}
