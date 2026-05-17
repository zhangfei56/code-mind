import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type {
  ExtensionSettings,
  HookDefinition,
  HookEvent,
  McpServerConfig,
} from "../shared/types.js";

const HOOK_EVENTS = new Set<HookEvent>([
  "SessionStart",
  "UserPromptSubmit",
  "BeforeModelCall",
  "AfterModelCall",
  "PreToolUse",
  "PostToolUse",
  "ToolError",
  "BeforePatchApply",
  "AfterPatchApply",
  "BeforeShellRun",
  "AfterShellRun",
  "BeforeContextCompact",
  "AfterContextCompact",
  "BeforeReview",
  "AfterReview",
  "SessionEnd",
]);

export function loadExtensionSettings(workspaceRoot: string): ExtensionSettings {
  const settingsPath = join(workspaceRoot, ".agent", "settings.yaml");
  if (!existsSync(settingsPath)) {
    return {};
  }

  const raw = YAML.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
  const rawHooks = (raw.hooks ?? {}) as Record<string, unknown>;
  const hooks = Object.fromEntries(
    Object.entries(rawHooks)
      .filter(([event]) => HOOK_EVENTS.has(event as HookEvent))
      .map(([event, defs]) => [
        event,
        ((defs as Array<Record<string, unknown>> | undefined) ?? []).map(
          (definition) => {
            const hook: HookDefinition = {
              name: String(definition.name ?? "unnamed-hook"),
              type: String(definition.type ?? "command") as HookDefinition["type"],
            };
            if (definition.command !== undefined) {
              hook.command = String(definition.command);
            }
            if (definition.path !== undefined) {
              hook.path = String(definition.path);
            }
            if (definition.url !== undefined) {
              hook.url = String(definition.url);
            }
            if (definition.timeout_ms !== undefined) {
              hook.timeoutMs = Number(definition.timeout_ms);
            }
            if (definition.matcher !== undefined) {
              hook.matcher = definition.matcher as NonNullable<HookDefinition["matcher"]>;
            }
            if (definition.on_failure !== undefined) {
              hook.onFailure = String(definition.on_failure) as NonNullable<HookDefinition["onFailure"]>;
            }
            return hook;
          },
        ),
      ]),
  ) as Partial<Record<HookEvent, HookDefinition[]>>;

  const servers = Object.fromEntries(
    Object.entries((raw.mcp as { servers?: Record<string, Record<string, unknown>> } | undefined)?.servers ?? {}).map(
      ([name, definition]) => [
        name,
        {
          transport: String(definition.transport ?? "stdio") as McpServerConfig["transport"],
          ...(definition.command === undefined ? {} : { command: String(definition.command) }),
          ...(definition.args === undefined ? {} : { args: (definition.args as unknown[]).map(String) }),
          ...(definition.env === undefined
            ? {}
            : { env: Object.fromEntries(Object.entries(definition.env as Record<string, unknown>).map(([key, value]) => [key, String(value)])) }),
          ...(definition.url === undefined ? {} : { url: String(definition.url) }),
          ...(definition.headers === undefined
            ? {}
            : {
                headers: Object.fromEntries(
                  Object.entries(definition.headers as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
                ),
              }),
        } satisfies McpServerConfig,
      ],
    ),
  );

  const settings: ExtensionSettings = {};
  if (Object.keys(servers).length > 0) {
    settings.mcp = { servers };
  }
  if (Object.keys(hooks).length > 0) {
    settings.hooks = hooks;
  }
  if (raw.extensions !== undefined) {
    const extensions = raw.extensions as NonNullable<ExtensionSettings["extensions"]>;
    settings.extensions = extensions;
  }
  if (raw.commands !== undefined) {
    const commands = raw.commands as NonNullable<ExtensionSettings["commands"]>;
    settings.commands = commands;
  }
  return settings;
}

export function saveExtensionSettings(
  workspaceRoot: string,
  settings: ExtensionSettings,
): void {
  const dir = join(workspaceRoot, ".agent");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "settings.yaml"), YAML.stringify(settings), "utf8");
}
