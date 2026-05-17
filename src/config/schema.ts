import { z } from "zod";

export const modelConfigSchema = z.object({
  provider: z.string(),
  baseUrl: z.string(),
  apiKey: z.string(),
  model: z.string(),
});

export const configSchema = z.object({
  defaultModel: z.string(),
  models: z.record(modelConfigSchema),
});

export type ModelConfig = z.infer<typeof modelConfigSchema>;
export type AgentConfig = z.infer<typeof configSchema>;
