import { z } from "zod";

export const logLevelSchema = z.enum(["error", "warn", "info", "debug"]);

export const modelConfigSchema = z.object({
  provider: z.string(),
  baseUrl: z.string(),
  apiKey: z.string(),
  model: z.string(),
  /** DeepSeek thinking mode; defaults to enabled for DeepSeek endpoints. */
  thinking: z.boolean().optional(),
});

export const configSchema = z.object({
  defaultModel: z.string(),
  models: z.record(modelConfigSchema),
  logging: z
    .object({
      level: logLevelSchema,
    })
    .default({ level: "info" }),
});

export type ModelConfig = z.infer<typeof modelConfigSchema>;
export type AgentConfig = z.infer<typeof configSchema>;
export type AgentLogLevel = z.infer<typeof logLevelSchema>;
