#!/usr/bin/env node

import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { parseArgs } from "./parse-args.js";
import { renderConfig } from "./config-show.js";
import { renderSessionList, renderSessionShow } from "./sessions.js";
import { confirmAction, confirmToolCall, createDefaultProfile } from "./prompt.js";
import { loadConfig } from "../config/load-config.js";
import { createModelProvider } from "../model/provider.js";
import { AgentRuntime } from "../agent/runtime.js";
import { AgentOrchestrator } from "../agent/orchestrator.js";
import { createId } from "../shared/ids.js";
import { nowIso } from "../shared/time.js";
import type { AgentResult, UserTask } from "../shared/types.js";
import { ValidationError } from "../shared/errors.js";
import { resolveWorkspace } from "../workspace/resolve-workspace.js";
import { FileSessionStore } from "../session/session-store.js";
import { EngineeringOrchestrator } from "../engineering/engineer.js";
import { VerificationPipeline } from "../engineering/verification.js";
import { GitManager } from "../engineering/git-manager.js";
import { ReviewEngine } from "../engineering/review-engine.js";
import { PlanManager } from "../engineering/plan-manager.js";
import { ToolRegistry } from "../tools/registry.js";
import { registerDefaultTools } from "../tools/default-tools.js";
import { loadExtensions } from "../extensions/loader.js";
import { buildCapabilities } from "../extensions/capabilities.js";
import { loadExtensionSettings, saveExtensionSettings } from "../extensions/settings.js";
import { createWebUiServer } from "../extensions/web-ui.js";
import { CiBot } from "../extensions/ci-bot.js";
import type { McpServerConfig } from "../shared/types.js";
import YAML from "yaml";
import { createRunSubagentTool } from "../extensions/subagent-tool.js";

async function buildRuntime(
  workspaceRoot: string,
  model?: import("../shared/types.js").ModelProvider,
  profile?: import("../shared/types.js").AgentProfile,
): Promise<{ runtime: AgentRuntime; toolRegistry: ToolRegistry }> {
  const toolRegistry = new ToolRegistry();
  registerDefaultTools(toolRegistry);
  const extensions = await loadExtensions(workspaceRoot, toolRegistry);
  const runtime = new AgentRuntime({
    toolRegistry,
    hookSystem: extensions.hookSystem,
    permissionPrompter: {
      approve(toolCall, decision) {
        return confirmToolCall(toolCall, decision.reason);
      },
    },
  });
  if (model && profile) {
    toolRegistry.register(
      createRunSubagentTool(
        workspaceRoot,
        extensions.subagentManager,
        runtime,
        model,
        profile,
        toolRegistry,
      ),
    );
  }
  return { runtime, toolRegistry };
}

function buildMcpPreset(serverName: string): McpServerConfig {
  switch (serverName) {
    case "github":
      return {
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
      };
    case "browser":
      return {
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-playwright"],
      };
    default:
      return {
        transport: "stdio",
        command: "node",
        args: [serverName],
      };
  }
}

function buildTask(args: ReturnType<typeof parseArgs>): UserTask {
  if ("command" in args) {
    throw new ValidationError("config show does not create a runtime task");
  }

  return {
    id: createId("task"),
    text: args.task,
    cwd: resolveWorkspace(resolve(args.cwd)),
    mode: args.mode,
    maxSteps: args.maxSteps,
    metadata: {
      createdAt: nowIso(),
    },
    ...(args.model === undefined ? {} : { requestedModel: args.model }),
  };
}

function render(task: UserTask, result: AgentResult): string {
  const lines = [
    `Task: ${task.text}`,
    `CWD: ${task.cwd}`,
    `Mode: ${task.mode}`,
    `Max steps: ${task.maxSteps}`,
    `Model: ${result.modelName}`,
    `Profile: ${createDefaultProfile().name}`,
    `Status: ${result.status}`,
    `Summary: ${result.summary ?? result.finalText}`,
  ];

  return lines.join("\n");
}

function renderPlan(markdown: string): string {
  return markdown;
}

function renderVerification(summary: string): string {
  return summary;
}

function renderReview(output: ReturnType<ReviewEngine["review"]>): string {
  return JSON.stringify(output, null, 2);
}

export async function main(argv: string[]): Promise<number> {
  try {
    const args = parseArgs(argv);
    if ("command" in args && args.command === "config") {
      const config = loadConfig();
      console.log(renderConfig(config));
      return 0;
    }

    if ("command" in args && args.command === "sessions") {
      const workspaceRoot = resolveWorkspace(resolve(args.cwd));
      if (args.subcommand === "resume") {
        const store = new FileSessionStore(workspaceRoot);
        const manifest = await store.readManifest(args.sessionId);
        const config = loadConfig();
        const requestedModel = args.model ?? manifest.model;
        const provider = createModelProvider(config, requestedModel);
        const { runtime } = await buildRuntime(workspaceRoot, provider, createDefaultProfile());
        const orchestrator = new AgentOrchestrator(runtime);
        const task: UserTask = {
          id: createId("task"),
          text: manifest.task,
          cwd: workspaceRoot,
          mode: manifest.mode,
          maxSteps: args.maxSteps,
          metadata: {
            createdAt: nowIso(),
            resumedFrom: args.sessionId,
          },
          requestedModel,
        };
        const result = await orchestrator.run({
          task,
          profile: createDefaultProfile(),
          model: provider,
          resumeSessionId: args.sessionId,
        });
        console.log(render(task, result));
        return 0;
      }
      console.log(
        args.subcommand === "list"
          ? await renderSessionList(workspaceRoot)
          : await renderSessionShow(workspaceRoot, args.sessionId),
      );
      return 0;
    }

    if ("command" in args && args.command === "capabilities") {
      const workspaceRoot = resolveWorkspace(resolve(args.cwd));
      const toolRegistry = new ToolRegistry();
      registerDefaultTools(toolRegistry);
      const extensions = await loadExtensions(workspaceRoot, toolRegistry);
      const config = loadConfig();
      console.log(
        JSON.stringify(
          buildCapabilities(Object.keys(config.models), toolRegistry, extensions.registry),
          null,
          2,
        ),
      );
      return 0;
    }

    if ("command" in args && args.command === "mcp") {
      const workspaceRoot = resolveWorkspace(resolve(args.cwd));
      const settings = loadExtensionSettings(workspaceRoot);
      if (args.subcommand === "list") {
        console.log(
          YAML.stringify(settings.mcp?.servers ?? {}),
        );
        return 0;
      }
      const servers: Record<string, McpServerConfig> = {
        ...(settings.mcp?.servers ?? {}),
        [args.serverName ?? "unknown"]: buildMcpPreset(args.serverName ?? "unknown"),
      };
      saveExtensionSettings(workspaceRoot, {
        ...settings,
        mcp: { servers },
      });
      console.log(`Added MCP server ${args.serverName}.`);
      return 0;
    }

    if ("command" in args && args.command === "hooks") {
      const workspaceRoot = resolveWorkspace(resolve(args.cwd));
      const extensions = await loadExtensions(workspaceRoot);
      console.log(JSON.stringify(extensions.registry.listHooks(), null, 2));
      return 0;
    }

    if ("command" in args && args.command === "skills") {
      const workspaceRoot = resolveWorkspace(resolve(args.cwd));
      const extensions = await loadExtensions(workspaceRoot);
      if (args.subcommand === "list") {
        console.log(
          extensions.skillEngine
            .list()
            .map((skill) => `${skill.name} - ${skill.description}`)
            .join("\n"),
        );
        return 0;
      }
      const skill = extensions.skillEngine.get(args.name);
      if (!skill) {
        throw new ValidationError(`Unknown skill: ${args.name}`);
      }
      console.log(skill.content);
      return 0;
    }

    if ("command" in args && args.command === "skill") {
      const workspaceRoot = resolveWorkspace(resolve(args.cwd));
      const extensions = await loadExtensions(workspaceRoot);
      const skill = extensions.skillEngine.get(args.name);
      if (!skill) {
        throw new ValidationError(`Unknown skill: ${args.name}`);
      }
      const config = loadConfig();
      const provider = createModelProvider(config, args.model);
      const { runtime } = await buildRuntime(workspaceRoot, provider, createDefaultProfile());
      const orchestrator = new AgentOrchestrator(runtime);
      const task: UserTask = {
        id: createId("task"),
        text: `${skill.content}\n\n${args.task ?? "请按该 skill 执行。"}`,
        cwd: workspaceRoot,
        mode: skill.allowedModes?.[0] ?? "read_only",
        maxSteps: 6,
        ...(args.model === undefined ? {} : { requestedModel: args.model }),
      };
      const result = await orchestrator.run({
        task,
        profile: createDefaultProfile(),
        model: provider,
      });
      console.log(render(task, result));
      return result.status === "success" ? 0 : 1;
    }

    if ("command" in args && args.command === "agents") {
      const workspaceRoot = resolveWorkspace(resolve(args.cwd));
      const extensions = await loadExtensions(workspaceRoot);
      console.log(JSON.stringify(extensions.subagentManager.list(), null, 2));
      return 0;
    }

    if ("command" in args && args.command === "plugin") {
      const workspaceRoot = resolveWorkspace(resolve(args.cwd));
      const extensions = await loadExtensions(workspaceRoot);
      switch (args.subcommand) {
        case "list":
          console.log(JSON.stringify(extensions.pluginManager.list(), null, 2));
          return 0;
        case "install": {
          const plugin = extensions.pluginManager.install(args.target ?? "");
          console.log(JSON.stringify(plugin, null, 2));
          return 0;
        }
        case "enable":
          extensions.pluginManager.enable(args.target ?? "");
          console.log(`Enabled plugin ${args.target}.`);
          return 0;
        case "disable":
          extensions.pluginManager.disable(args.target ?? "");
          console.log(`Disabled plugin ${args.target}.`);
          return 0;
        case "remove":
          extensions.pluginManager.remove(args.target ?? "");
          console.log(`Removed plugin ${args.target}.`);
          return 0;
      }
    }

    if ("command" in args && args.command === "web") {
      const workspaceRoot = resolveWorkspace(resolve(args.cwd));
      const server = createWebUiServer(workspaceRoot);
      await new Promise<void>((resolvePromise) => {
        server.listen(args.port, () => {
          console.log(`Web UI listening on http://127.0.0.1:${args.port}`);
          resolvePromise();
        });
      });
      return 0;
    }

    if ("command" in args && args.command === "ci") {
      const workspaceRoot = resolveWorkspace(resolve(args.cwd));
      const markdown = await new CiBot().review(workspaceRoot, args.output);
      console.log(markdown);
      return 0;
    }

    if ("command" in args && args.command === "verify") {
      const workspaceRoot = resolveWorkspace(resolve(args.cwd));
      const verification = await new VerificationPipeline().run(workspaceRoot, {
        ...(args.test === undefined ? {} : { test: args.test }),
        ...(args.lint === undefined ? {} : { lint: args.lint }),
        ...(args.build === undefined ? {} : { build: args.build }),
      });
      console.log(renderVerification(verification.summary));
      return verification.passed ? 0 : 1;
    }

    if ("command" in args && args.command === "review") {
      const workspaceRoot = resolveWorkspace(resolve(args.cwd));
      const extensions = await loadExtensions(workspaceRoot);
      const command = extensions.commandSystem.get("review");
      if (command) {
        console.log(command.content);
      }
      const git = new GitManager();
      const changed = await git.changedFiles(workspaceRoot);
      const diff = await git.diff(workspaceRoot);
      const review = new ReviewEngine().review({
        task: "Review current diff",
        changedFiles: [
          ...changed.modified,
          ...changed.deleted,
          ...changed.untracked,
        ],
        diff,
        testResults: [],
      });
      console.log(renderReview(review));
      return review.passed ? 0 : 1;
    }

    const task = buildTask(args);
    const workspaceRoot = task.cwd;
    const extensions = await loadExtensions(workspaceRoot);
    const command = args.task.startsWith("/") ? extensions.commandSystem.get(args.task) : undefined;
    const selectedSkill = args.skill ? extensions.skillEngine.get(args.skill) : undefined;
    const finalTask = command
      ? {
          ...task,
          text: `${command.content}\n\n${task.text}`,
          mode: command.mode ?? task.mode,
        }
      : selectedSkill
        ? {
            ...task,
            text: `${selectedSkill.content}\n\n${task.text}`,
            mode: selectedSkill.allowedModes?.[0] ?? task.mode,
          }
        : task;
    const config = loadConfig();
    const provider = createModelProvider(config, args.model);
    const profile = createDefaultProfile();
    const { runtime } = await buildRuntime(workspaceRoot, provider, profile);
    if (finalTask.mode === "plan" || args.planFirst || args.useWorktree) {
      const engineering = await new EngineeringOrchestrator().run({
        task: finalTask,
        profile,
        model: provider,
        runtime,
        workspaceRoot,
        ...(args.planFirst === undefined ? {} : { planFirst: args.planFirst }),
        planOnly: finalTask.mode === "plan",
        ...(args.useWorktree === undefined ? {} : { useWorktree: args.useWorktree }),
        approvePlan(markdown) {
          return confirmAction(`${markdown}\n\nApprove this plan?`);
        },
      });
      if (engineering.plan && (finalTask.mode === "plan" || args.planFirst)) {
        console.log(renderPlan(new PlanManager().renderMarkdown(engineering.plan)));
      }
      if (engineering.runtimeResult) {
        console.log(render({ ...finalTask, cwd: engineering.taskCwd }, engineering.runtimeResult));
        if (engineering.verification) {
          console.log(`\nVerification:\n${engineering.verification.summary}`);
        }
        if (engineering.review) {
          console.log(`\nReview:\n${JSON.stringify(engineering.review, null, 2)}`);
        }
      }
      return engineering.runtimeResult?.status === "success" ? 0 : 1;
    }
    const orchestrator = new AgentOrchestrator(runtime);
    const result = await orchestrator.run({
      task: finalTask,
      profile,
      model: provider,
    });
    console.log(render(finalTask, result));
    return 0;
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error(error.message);
      return 1;
    }

    console.error(error);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
