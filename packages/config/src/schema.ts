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

export const compactionConfigSchema = z.object({
  charThreshold: z.number().int().positive().optional(),
  retainedMessages: z.number().int().positive().optional(),
  retainedObservations: z.number().int().positive().optional(),
  /** Config `models` key for dedicated compact model (overridden by CODE_MIND_COMPACTION_MODEL). */
  model: z.string().optional(),
});

export const configSchema = z.object({
  defaultModel: z.string(),
  models: z.record(modelConfigSchema),
  logging: z
    .object({
      level: logLevelSchema,
    })
    .default({ level: "info" }),
  compaction: compactionConfigSchema.optional(),
});

export type ModelConfig = z.infer<typeof modelConfigSchema>;
export type CompactionConfig = z.infer<typeof compactionConfigSchema>;
export type AgentConfig = z.infer<typeof configSchema>;
export type AgentLogLevel = z.infer<typeof logLevelSchema>;
