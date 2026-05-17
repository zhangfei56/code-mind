import { exec } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import type { HookDefinition, HookEvent, HookInput, HookResult } from "../shared/types.js";

const execAsync = promisify(exec);

function matchesHook(hook: HookDefinition, input: HookInput): boolean {
  if (!hook.matcher?.tool) {
    return true;
  }
  return input.toolCall?.name === hook.matcher.tool;
}

export class HookSystem {
  constructor(
    private readonly hooks: Partial<Record<HookEvent, HookDefinition[]>>,
    private readonly workspaceRoot: string,
  ) {}

  async run(event: HookEvent, input: HookInput): Promise<HookResult[]> {
    const definitions = (this.hooks[event] ?? []).filter((hook) => matchesHook(hook, input));
    const results: HookResult[] = [];
    for (const hook of definitions) {
      const result = await this.executeHook(hook, input);
      results.push(result);
      if (result.action === "deny" || result.action === "ask") {
        return results;
      }
    }
    return results;
  }

  list(): HookDefinition[] {
    return Object.values(this.hooks).flat();
  }

  private async executeHook(
    hook: HookDefinition,
    input: HookInput,
  ): Promise<HookResult> {
    try {
      switch (hook.type) {
        case "command":
          if (!hook.command) {
            return { action: "continue" };
          }
          await execAsync(hook.command, {
            cwd: this.workspaceRoot,
            timeout: hook.timeoutMs ?? 15_000,
          });
          return { action: "continue" };
        case "script":
          if (!hook.path) {
            return { action: "continue" };
          }
          return await this.runScriptHook(hook.path, input);
        case "http":
          return { action: "continue" };
      }
    } catch (error) {
      if (hook.onFailure === "deny") {
        return {
          action: "deny",
          reason: error instanceof Error ? error.message : "Hook failed",
        };
      }
      if (hook.onFailure === "ask") {
        return {
          action: "ask",
          reason: error instanceof Error ? error.message : "Hook requires confirmation",
        };
      }
      return { action: "continue" };
    }
  }

  private async runScriptHook(
    relativePath: string,
    input: HookInput,
  ): Promise<HookResult> {
    const resolvedPath = resolve(this.workspaceRoot, relativePath);
    const imported = await import(resolvedPath);
    const hookFn = imported.default as ((value: HookInput) => Promise<HookResult> | HookResult) | undefined;
    if (!hookFn) {
      return { action: "continue" };
    }
    return await hookFn(input);
  }
}
