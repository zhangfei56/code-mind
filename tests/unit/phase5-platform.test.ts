import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "../../apps/cli/src/cli/parse-args.js";
import {
  buildCapabilities,
  CiBot,
  CommandSystem,
  HookSystem,
  loadExtensionSettings,
  PluginManager,
  saveExtensionSettings,
  SkillEngine,
  SubagentManager,
  type SubagentLoopHostFactory,
} from "@code-mind/capabilities";
import { McpAdapter } from "@code-mind/execution";
import { createWebUiServer } from "@code-mind/api-server";
import {
  loadComposedToolRegistry,
  loadWorkspaceExtensions,
} from "@code-mind/agent-composition";
import { createAgentLoopController } from "@code-mind/core";
import type {
  AgentProfile,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "@code-mind/shared";

class ReviewProvider implements ModelProvider {
  name = "fake";
  async chat(_request: ModelRequest): Promise<ModelResponse> {
    return {
      text: "subagent review done",
      finishReason: "stop",
      raw: {},
      toolCalls: [],
    };
  }
  getCapabilities(): ModelCapabilities {
    return {
      toolCall: true,
      parallelToolCall: false,
      jsonSchema: true,
      vision: false,
      reasoning: false,
      maxContextTokens: 100000,
      maxOutputTokens: 8000,
      supportsPromptCache: false,
      supportsComputerUse: false,
    };
  }
}

export async function runPhase5PlatformTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-phase5-"));
  mkdirSync(join(workspace, ".agent", "skills", "code-review"), { recursive: true });
  mkdirSync(join(workspace, ".agent", "commands"), { recursive: true });
  mkdirSync(join(workspace, ".agent", "agents"), { recursive: true });
  mkdirSync(join(workspace, ".agent", "tmp"), { recursive: true });
  mkdirSync(join(workspace, "src"), { recursive: true });
  writeFileSync(join(workspace, "src", "math.ts"), "export const value = 1;\n", "utf8");

  writeFileSync(
    join(workspace, ".agent", "skills", "code-review", "SKILL.md"),
    "# Skill: Code Review\n\nReview diff only.",
    "utf8",
  );
  writeFileSync(
    join(workspace, ".agent", "skills", "code-review", "skill.yaml"),
    "name: code-review\ndescription: review diff\ntools:\n  - git_diff\nallowed_modes:\n  - ask\n",
    "utf8",
  );
  writeFileSync(
    join(workspace, ".agent", "commands", "review.md"),
    "# Command: review\n\n请审查当前 git diff。",
    "utf8",
  );
  writeFileSync(
    join(workspace, ".agent", "commands", "review.yaml"),
    "name: review\ndescription: 审查当前 diff\nmode: ask\nskill: code-review\n",
    "utf8",
  );
  writeFileSync(
    join(workspace, ".agent", "agents", "code-reviewer.yaml"),
    "name: code-reviewer\ndescription: 审查 diff\nmode: ask\ntools:\n  - read_file\n  - grep\n",
    "utf8",
  );

  saveExtensionSettings(workspace, {
    mcp: {
      servers: {
        mock: {
          transport: "stdio",
          command: process.execPath,
          args: [resolve("tests/fixtures/mock-mcp-server.js")],
        },
      },
    },
    hooks: {
      AfterPatchApply: [
        {
          name: "touch-marker",
          type: "command",
          command: `echo formatted > ${join(workspace, ".agent", "tmp", "marker.txt")}`,
        },
      ],
      PreToolUse: [
        {
          name: "deny-math",
          type: "script",
          path: resolve("tests/fixtures/deny-hook.mjs"),
          matcher: { tool: "apply_patch" },
        },
      ],
    },
  });

  const settings = loadExtensionSettings(workspace);
  assert.ok(settings.mcp?.servers?.mock);

  const { toolRegistry: registry, extensions } = await loadComposedToolRegistry(workspace);
  const manifest = buildCapabilities(["local"], registry, extensions.registry);
  assert.ok(manifest.tools.includes("mcp__mock__echo"));
  assert.ok(manifest.skills.includes("code-review"));
  assert.ok(manifest.subagents.includes("code-reviewer"));
  assert.ok(manifest.commands.includes("review"));

  const adapter = new McpAdapter();
  const mcpTools = await adapter.listTools(
    "mock",
    settings.mcp?.servers?.mock ?? {
      transport: "stdio",
      command: process.execPath,
      args: [resolve("tests/fixtures/mock-mcp-server.js")],
    },
    workspace,
  );
  const mcpResult = await mcpTools[0]!.execute({ text: "hello" }, {
    sessionId: "session",
    workspaceRoot: workspace,
    cwd: workspace,
    mode: "ask",
  });
  assert.match(mcpResult.output, /hello/);
  adapter.dispose();

  const hookSystem = new HookSystem(settings.hooks ?? {}, workspace);
  const hookResults = await hookSystem.run("PreToolUse", {
    event: "PreToolUse",
    sessionId: "session",
    projectPath: workspace,
    mode: "edit",
    toolCall: {
      id: "call_1",
      name: "apply_patch",
      arguments: { patch: "*** Begin Patch" },
    },
  });
  assert.equal(hookResults[0]?.action, "deny");
  const afterPatchResults = await hookSystem.run("AfterPatchApply", {
    event: "AfterPatchApply",
    sessionId: "session",
    projectPath: workspace,
    mode: "edit",
  });
  assert.equal(afterPatchResults[0]?.action, "continue");
  assert.ok(existsSync(join(workspace, ".agent", "tmp", "marker.txt")));

  const skills = new SkillEngine(workspace).list();
  assert.equal(skills[0]?.name, "code-review");
  const commands = new CommandSystem(workspace).list();
  assert.equal(commands[0]?.name, "review");

  const pluginSource = mkdtempSync(join(tmpdir(), "code-mind-plugin-"));
  mkdirSync(join(pluginSource, "skills", "frontend-ui"), { recursive: true });
  mkdirSync(join(pluginSource, "commands"), { recursive: true });
  mkdirSync(join(pluginSource, "agents"), { recursive: true });
  writeFileSync(
    join(pluginSource, "plugin.yaml"),
    [
      "name: frontend-agent",
      "version: 0.1.0",
      "description: frontend plugin",
      "skills:",
      "  - path: skills/frontend-ui",
      "agents:",
      "  - path: agents/frontend-reviewer.yaml",
      "commands:",
      "  - name: ui-review",
      "    path: commands/ui-review.md",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(pluginSource, "skills", "frontend-ui", "SKILL.md"),
    "# Skill: Frontend UI\n\nInspect UI.",
    "utf8",
  );
  writeFileSync(
    join(pluginSource, "commands", "ui-review.md"),
    "# Command: ui-review\n\nRun UI review.",
    "utf8",
  );
  writeFileSync(
    join(pluginSource, "agents", "frontend-reviewer.yaml"),
    "name: frontend-reviewer\ndescription: review ui\ntools:\n  - read_file\n",
    "utf8",
  );
  const plugins = new PluginManager(workspace);
  const installed = plugins.install(pluginSource);
  plugins.enable(installed.name);
  assert.ok(plugins.list().some((plugin) => plugin.name === "frontend-agent"));
  const refreshedExtensions = await loadWorkspaceExtensions(workspace);
  assert.ok(refreshedExtensions.skillEngine.list().some((skill) => skill.name === "frontend-ui"));
  assert.ok(refreshedExtensions.commandSystem.list().some((command) => command.name === "ui-review"));

  const subagentManager = new SubagentManager(workspace);
  const loop = createAgentLoopController();
  const hostFactory: SubagentLoopHostFactory = {
    getHost(options) {
      return options?.toolRegistry
        ? createAgentLoopController({ toolRegistry: options.toolRegistry })
        : loop;
    },
  };
  const subagentResult = await subagentManager.run(
    {
      parentSessionId: "parent",
      agentName: "code-reviewer",
      task: "审查当前 diff",
    },
    hostFactory,
    new ReviewProvider(),
    {
      id: "default",
      name: "Default",
      systemPrompt: "You are a code agent.",
    } satisfies AgentProfile,
    registry,
  );
  assert.equal(subagentResult.success, true);

  const server = createWebUiServer(workspace);
  assert.ok(server);
  server.close();

  writeFileSync(join(workspace, "package.json"), JSON.stringify({ name: "phase5-demo" }), "utf8");
  execFileSync("git", ["init"], { cwd: workspace });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: workspace });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: workspace });
  execFileSync("git", ["add", "."], { cwd: workspace });
  execFileSync("git", ["commit", "-m", "init"], { cwd: workspace });
  writeFileSync(join(workspace, "src", "math.ts"), "export const value = 2;\n", "utf8");
  const ciMarkdown = await new CiBot().review(workspace, join(workspace, "review.md"));
  assert.match(ciMarkdown, /CI Review/);
  assert.ok(existsSync(join(workspace, "review.md")));

  const capabilitiesArgs = parseArgs(["capabilities"]);
  assert.equal("command" in capabilitiesArgs && capabilitiesArgs.command, "capabilities");
  const skillRunArgs = parseArgs(["skill", "run", "code-review", "审查当前 diff"]);
  assert.equal("command" in skillRunArgs && skillRunArgs.command, "skill");
  const ciArgs = parseArgs(["ci", "review", "--output", "review.md"]);
  assert.equal("command" in ciArgs && ciArgs.command, "ci");
  const webArgs = parseArgs(["web", "start", "--port", "4100"]);
  assert.equal("command" in webArgs && webArgs.command, "web");
  extensions.mcpAdapter.dispose();
  refreshedExtensions.mcpAdapter.dispose();
}
