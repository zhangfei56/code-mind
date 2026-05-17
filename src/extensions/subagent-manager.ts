import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { AgentRuntime } from "../agent/runtime.js";
import type {
  AgentProfile,
  ModelProvider,
  SubagentDefinition,
} from "../shared/types.js";
import { ToolRegistry as Registry } from "../tools/registry.js";

export interface SubagentRunInput {
  parentSessionId: string;
  agentName: string;
  task: string;
  context?: string;
  allowedFiles?: string[];
  maxSteps?: number;
}

export interface SubagentRunResult {
  success: boolean;
  summary: string;
  findings: Array<{ message: string }>;
  childSessionId: string;
}

function loadDefinitions(workspaceRoot: string): SubagentDefinition[] {
  const sources = [join(workspaceRoot, ".agent", "agents")];
  const pluginBase = join(workspaceRoot, ".agent", "plugins");
  if (existsSync(pluginBase)) {
    for (const plugin of readdirSync(pluginBase)) {
      sources.push(join(pluginBase, plugin, "agents"));
    }
  }

  return sources.flatMap((agentsDir) => {
    if (!existsSync(agentsDir)) {
      return [];
    }
    return readdirSync(agentsDir)
    .filter((file) => file.endsWith(".yaml"))
    .map((file) => {
      const raw = YAML.parse(readFileSync(join(agentsDir, file), "utf8")) as Record<string, unknown>;
      return {
        name: String(raw.name ?? file.replace(/\.yaml$/, "")),
        description: String(raw.description ?? ""),
        ...(raw.model === undefined ? {} : { model: String(raw.model) }),
        tools: ((raw.tools as unknown[]) ?? []).map(String),
        ...(raw.permissions === undefined
          ? {}
          : {
              write: !((raw.permissions as Record<string, unknown>).write === false),
              shell: !((raw.permissions as Record<string, unknown>).shell === false),
            }),
      } satisfies SubagentDefinition;
    });
  });
}

export class SubagentManager {
  constructor(private readonly workspaceRoot: string) {}

  list(): SubagentDefinition[] {
    return loadDefinitions(this.workspaceRoot);
  }

  get(name: string): SubagentDefinition | undefined {
    return this.list().find((agent) => agent.name === name);
  }

  async run(
    input: SubagentRunInput,
    runtime: AgentRuntime,
    model: ModelProvider,
    profile: AgentProfile,
    toolRegistry?: Registry,
  ): Promise<SubagentRunResult> {
    const definition = this.get(input.agentName);
    if (!definition) {
      throw new Error(`Unknown subagent: ${input.agentName}`);
    }
    const filteredRegistry = new Registry();
    if (toolRegistry) {
      for (const name of definition.tools) {
        const tool = toolRegistry.get(name);
        if (tool) {
          filteredRegistry.register(tool);
        }
      }
    }
    const scopedRuntime = toolRegistry ? new AgentRuntime({ toolRegistry: filteredRegistry }) : runtime;
    const result = await scopedRuntime.run({
      task: {
        id: `subagent_${input.agentName}`,
        text: input.context ? `${input.task}\n\nContext:\n${input.context}` : input.task,
        cwd: this.workspaceRoot,
        mode: definition.write === false ? "read_only" : "suggest",
        maxSteps: input.maxSteps ?? 4,
        ...(definition.model === undefined ? {} : { requestedModel: definition.model }),
      },
      profile: {
        ...profile,
        id: `${profile.id}:${definition.name}`,
        name: definition.name,
        systemPrompt: `${profile.systemPrompt}\n\nSubagent role: ${definition.description}`,
      },
      model,
    });
    return {
      success: result.status === "success",
      summary: result.finalText,
      findings: [{ message: result.summary ?? result.finalText }],
      childSessionId: result.sessionId,
    };
  }
}
