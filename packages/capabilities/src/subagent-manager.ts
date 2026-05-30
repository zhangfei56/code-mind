import type { AgentMode, AgentProfile, ModelProvider, SubagentDefinition } from "@code-mind/shared";
import { AGENT_MODES, isAgentRunSuccessful } from "@code-mind/shared";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { ToolRegistry as Registry } from "@code-mind/execution";
import {
  getBuiltinSubagent,
  mergeSubagentDefinitions,
  roleSystemPrompt,
} from "./subagent-builtin.js";
import type { SubagentLoopHostFactory } from "./subagent-host-factory.js";

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
  runId: string;
}

function isAgentMode(value: string): value is AgentMode {
  return (AGENT_MODES as readonly string[]).includes(value);
}

function resolveSubagentMode(
  raw: Record<string, unknown>,
): AgentMode | undefined {
  if (raw.mode !== undefined) {
    const mode = String(raw.mode);
    return isAgentMode(mode) ? mode : undefined;
  }
  const permissions = raw.permissions as Record<string, unknown> | undefined;
  if (permissions?.write === false) {
    return "ask";
  }
  return undefined;
}

function resolveSubagentRole(
  raw: Record<string, unknown>,
): SubagentDefinition["role"] | undefined {
  const role = raw.role;
  if (role === "explore" || role === "plan" || role === "general") {
    return role;
  }
  return undefined;
}

export function resolveSubagentMaxSteps(
  definition: SubagentDefinition,
  requested?: number,
): number {
  const base =
    definition.role === "explore" ? 4 : definition.role === "plan" ? 5 : 5;
  const cap = base + 2;
  const steps = requested ?? base;
  return Math.min(Math.max(steps, 1), cap);
}

function loadWorkspaceDefinitions(workspaceRoot: string): SubagentDefinition[] {
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
        const raw = YAML.parse(readFileSync(join(agentsDir, file), "utf8")) as Record<
          string,
          unknown
        >;
        const mode = resolveSubagentMode(raw);
        const role = resolveSubagentRole(raw);
        return {
          name: String(raw.name ?? file.replace(/\.yaml$/, "")),
          description: String(raw.description ?? ""),
          ...(raw.model === undefined ? {} : { model: String(raw.model) }),
          ...(mode === undefined ? {} : { mode }),
          ...(role === undefined ? {} : { role }),
          tools: ((raw.tools as unknown[]) ?? []).map(String),
        } satisfies SubagentDefinition;
      });
  });
}

export class SubagentManager {
  constructor(private readonly workspaceRoot: string) {}

  list(): SubagentDefinition[] {
    return mergeSubagentDefinitions(loadWorkspaceDefinitions(this.workspaceRoot));
  }

  get(name: string): SubagentDefinition | undefined {
    return this.list().find((agent) => agent.name === name) ?? getBuiltinSubagent(name);
  }

  async run(
    input: SubagentRunInput,
    hostFactory: SubagentLoopHostFactory,
    model: ModelProvider,
    profile: AgentProfile,
    toolRegistry?: Registry,
    parentMode: AgentMode = "edit",
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
    const host = hostFactory.getHost(
      toolRegistry ? { toolRegistry: filteredRegistry } : undefined,
    );

    const roleHint = roleSystemPrompt(definition.role);
    const resolvedMode =
      definition.mode ??
      (definition.role === "plan" ? "plan" : definition.role === "explore" ? "ask" : parentMode);

    const result = await host.run({
      task: {
        id: `subagent_${input.agentName}`,
        text: input.context ? `${input.task}\n\nContext:\n${input.context}` : input.task,
        cwd: this.workspaceRoot,
        mode: resolvedMode,
        maxSteps: resolveSubagentMaxSteps(definition, input.maxSteps),
        metadata: {
          subagent: true,
          subagentName: definition.name,
          ...(definition.role === undefined ? {} : { subagentRole: definition.role }),
          parentSessionId: input.parentSessionId,
        },
        ...(definition.model === undefined ? {} : { requestedModel: definition.model }),
      },
      profile: {
        ...profile,
        id: `${profile.id}:${definition.name}`,
        name: definition.name,
        systemPrompt: [
          profile.systemPrompt,
          `Subagent role: ${definition.description}`,
          ...(roleHint ? [roleHint] : []),
        ].join("\n\n"),
      },
      model,
    });
    return {
      success: isAgentRunSuccessful(result),
      summary: result.finalText,
      findings: [{ message: result.summary ?? result.finalText }],
      childSessionId: result.sessionId,
      runId: result.runId,
    };
  }
}
