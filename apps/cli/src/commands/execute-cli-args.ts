#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CliArgs, RunCliArgs } from "../cli/parse-args.js";
import { renderConfig } from "./config.js";
import {
  deleteSession,
  exportSession,
  importSession,
  listRecentSessionId,
  renderSessionList,
  renderSessionListJson,
  renderSessionRevert,
  renderSessionShow,
  type SessionExportBundle,
} from "./sessions.js";
import {
  getLoadedConfig,
  renderConfigPaths,
  renderModelsList,
  renderProvidersList,
} from "./models.js";
import { createDefaultProfile, confirmAction } from "../ui/prompt.js";
import { renderPlanBlock, renderTaskResult, renderVerification } from "../ui/render.js";
import { createProgressPrinter } from "../ui/progress-printer.js";
import { buildRunHeaderDetails } from "../ui/header-details.js";
import { CliPermissionPrompter } from "../interactive/cli-permission-prompter.js";
import { CliClarifyPrompter } from "../interactive/cli-clarify-prompter.js";
import { CliSkillConfirmPrompter } from "../interactive/cli-skill-confirm-prompter.js";
import { TerminalComposer } from "../ui/terminal-composer.js";
import { theme } from "../ui/theme.js";
import {
  composeAgentLoop,
  loadComposedToolRegistry,
  loadWorkspaceExtensions,
} from "@code-mind/agent-composition";
import { createCliAgentLoop } from "../cli/runtime-deps.js";
import { buildCompactionRuntimeOverrides } from "../cli/compaction-runtime.js";
import {
  loadConfig,
  loadConfigForModel,
  type AgentConfig,
  type ModelConfig,
} from "@code-mind/config";
import { createModelProvider } from "@code-mind/models";
import {
  CiBot,
  buildCapabilities,
  loadExtensionSettings,
  mergeSkillRunPolicy,
  resolveRunSkillPolicy,
  resolveSkillMode,
  saveExtensionSettings,
} from "@code-mind/capabilities";
import { ReviewEngine, VerificationPipeline } from "@code-mind/verify";
import {
  applyRecommendedMaxSteps,
  createOrchestrationSessionStore,
  executeFromApprovedPlan,
  isBroadRepoRootTask,
  isAgentRunSuccessful,
  runAgentSession,
} from "@code-mind/core";
import {
  createId,
  logProcess,
  nowIso,
  ValidationError,
  type McpServerConfig,
  type UserTask,
} from "@code-mind/shared";
import { resolveWorkspace } from "@code-mind/workspace";
import { startApiServer } from "@code-mind/api-server";
import { GitManager } from "@code-mind/execution";
import YAML from "yaml";
import { startInteractiveShell } from "../interactive/repl.js";
import { resolveRunContext } from "./run-context.js";
import {
  forkSession,
  listContinuableSessionId,
} from "./sessions.js";

function cliExecuteLogDebug(message: string, metadata?: Record<string, unknown>): void {
  logProcess("cli.execute", "debug", message, metadata);
}

function applyCliLogOverrides(args: CliArgs): void {
  if ("logLevel" in args && args.logLevel) {
    process.env.AGENT_LOG_LEVEL = args.logLevel;
    logProcess("cli", "debug", `Bootstrap AGENT_LOG_LEVEL=${args.logLevel}`);
  }
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

async function resolveInteractiveSessionId(
  args: Extract<CliArgs, { command: "interactive" }>,
  workspaceRoot: string,
): Promise<string | undefined> {
  let sessionId = args.sessionId;
  if (args.continue && !sessionId) {
    sessionId = await listContinuableSessionId(workspaceRoot);
    if (!sessionId) {
      throw new ValidationError("No session to continue. Start a new run first.");
    }
  }
  if (args.fork && sessionId) {
    sessionId = await forkSession(workspaceRoot, sessionId);
  }
  return sessionId;
}

function renderReview(output: ReturnType<ReviewEngine["review"]>): string {
  return JSON.stringify(output, null, 2);
}

function resolveSelectedModelConfig(
  key: string | undefined,
  config: AgentConfig,
): { provider: string; model: string } | undefined {
  if (!key) {
    return undefined;
  }
  if (key.includes(":")) {
    const [provider, model] = key.split(":", 2);
    if (!provider || !model) {
      return undefined;
    }
    return { provider, model };
  }
  const resolved: ModelConfig | undefined = config.models[key];
  if (!resolved) {
    return undefined;
  }
  return { provider: resolved.provider, model: resolved.model };
}

function resolveProviderModel(
  modelKey: string | undefined,
  config: AgentConfig,
): string | undefined {
  return resolveSelectedModelConfig(modelKey, config)?.model;
}

export async function executeCliArgs(args: CliArgs): Promise<number> {
  applyCliLogOverrides(args);
  cliExecuteLogDebug("Executing CLI command.", {
    command: "command" in args ? args.command : "run",
    args,
  });
  if ("command" in args && args.command === "interactive") {
    const workspaceRoot = resolveWorkspace(resolve(args.cwd));
    const initialSessionId = await resolveInteractiveSessionId(args, workspaceRoot);
    return startInteractiveShell({
      cwd: args.cwd,
      mode: args.mode,
      maxSteps: args.maxSteps,
      ...(args.model === undefined ? {} : { model: args.model }),
      ...(initialSessionId === undefined ? {} : { initialSessionId }),
    });
  }
  if ("command" in args && args.command === "config") {
    console.log(renderConfig(loadConfig()));
    return 0;
  }

  if ("command" in args && args.command === "models") {
    const config = getLoadedConfig();
    console.log(renderModelsList(config, args.provider));
    return 0;
  }

  if ("command" in args && args.command === "providers") {
    console.log(renderProvidersList(getLoadedConfig()));
    return 0;
  }

  if ("command" in args && args.command === "export") {
    const workspaceRoot = resolveWorkspace(resolve(args.cwd));
    const sessionId = args.sessionId ?? (await listRecentSessionId(workspaceRoot));
    if (!sessionId) {
      throw new ValidationError("No session to export. Pass a session id or create a session first.");
    }
    const bundle = await exportSession(workspaceRoot, sessionId);
    console.log(JSON.stringify(bundle, null, 2));
    return 0;
  }

  if ("command" in args && args.command === "import") {
    const workspaceRoot = resolveWorkspace(resolve(args.cwd));
    const raw = await readFile(resolve(args.filePath), "utf8");
    const bundle = JSON.parse(raw) as SessionExportBundle;
    const sessionId = await importSession(workspaceRoot, bundle);
    console.log(`Imported session ${sessionId}.`);
    return 0;
  }

  if ("command" in args && args.command === "sessions") {
    const workspaceRoot = resolveWorkspace(resolve(args.cwd));
    if (args.subcommand === "delete") {
      await deleteSession(workspaceRoot, args.sessionId);
      console.log(`Deleted session ${args.sessionId}.`);
      return 0;
    }
    if (args.subcommand === "resume") {
      const store = createOrchestrationSessionStore(workspaceRoot);
      const manifest = await store.readManifest(args.sessionId);
      const sessionRoot = manifest.projectPath;
      const requestedModel = args.model ?? manifest.model;
      const config = loadConfigForModel(requestedModel);
      const provider = createModelProvider(config, requestedModel);
      const task = applyRecommendedMaxSteps(
        {
          id: createId("task"),
          text: manifest.task,
          cwd: manifest.executionCwd ?? sessionRoot,
          mode: manifest.mode,
          maxSteps: args.maxSteps,
          metadata: {
            createdAt: nowIso(),
            resumedFrom: args.sessionId,
          },
          requestedModel,
        },
        sessionRoot,
      );
      const resumeProviderModel = resolveProviderModel(requestedModel, config);
      const profile = createDefaultProfile(requestedModel ?? provider.name, {
        repoRootFocus: isBroadRepoRootTask(task, sessionRoot),
        ...(resumeProviderModel !== undefined ? { providerModel: resumeProviderModel } : {}),
      });
      const { loop } = await createCliAgentLoop(sessionRoot, provider, profile, {
        config,
        modelKey: requestedModel ?? provider.name,
      });
      const session = await runAgentSession({
        task,
        profile,
        model: provider,
        loop,
        workspaceRoot: sessionRoot,
        sessionRoot,
        resumeSessionId: args.sessionId,
      });
      console.log(renderTaskResult(session.task, session.result));
      return isAgentRunSuccessful(session.result) ? 0 : 1;
    }
    if (args.subcommand === "execute") {
      const store = createOrchestrationSessionStore(workspaceRoot);
      const planManifest = await store.readManifest(args.planSessionId);
      const sessionRoot = planManifest.projectPath;
      const requestedModel = args.model ?? planManifest.model;
      const config = loadConfigForModel(requestedModel);
      const provider = createModelProvider(config, requestedModel);
      const executeProviderModel = resolveProviderModel(requestedModel, config);
      const profile = createDefaultProfile(requestedModel ?? provider.name, {
        repoRootFocus: false,
        ...(executeProviderModel !== undefined ? { providerModel: executeProviderModel } : {}),
      });
      const { loop } = await createCliAgentLoop(sessionRoot, provider, profile, {
        config,
        modelKey: requestedModel ?? provider.name,
      });
      const session = await executeFromApprovedPlan({
        planSessionId: args.planSessionId,
        ...(args.mode === undefined ? {} : { executionMode: args.mode }),
        profile,
        model: provider,
        loop,
        workspaceRoot: sessionRoot,
        sessionRoot,
        maxSteps: args.maxSteps,
      });
      console.log(renderTaskResult(session.task, session.result));
      return isAgentRunSuccessful(session.result) ? 0 : 1;
    }
    if (args.subcommand === "revert") {
      console.log(await renderSessionRevert(workspaceRoot, args.sessionId));
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
    const { toolRegistry, extensions } = await loadComposedToolRegistry(workspaceRoot);
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
      console.log(YAML.stringify(settings.mcp?.servers ?? {}));
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
    const extensions = await loadWorkspaceExtensions(workspaceRoot);
    console.log(JSON.stringify(extensions.registry.listHooks(), null, 2));
    return 0;
  }

  if ("command" in args && args.command === "skills") {
    const workspaceRoot = resolveWorkspace(resolve(args.cwd));
    const extensions = await loadWorkspaceExtensions(workspaceRoot);
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
    const { toolRegistry, extensions } = await loadComposedToolRegistry(workspaceRoot);
    const skill = extensions.skillEngine.get(args.name);
    if (!skill) {
      throw new ValidationError(`Unknown skill: ${args.name}`);
    }
    const config = loadConfigForModel(args.model);
    const provider = createModelProvider(config, args.model);
    const previewTask = applyRecommendedMaxSteps(
      {
        id: createId("task"),
        text: `${skill.content}\n\n${args.task ?? "请按该 skill 执行。"}`,
        cwd: workspaceRoot,
        mode: resolveSkillMode(skill, args.mode, args.modeExplicit),
        maxSteps: 6,
        ...(args.model === undefined ? {} : { requestedModel: args.model }),
      },
      workspaceRoot,
    );
    const skillProviderModel = resolveProviderModel(args.model, config);
    const profile = createDefaultProfile(args.model ?? provider.name, {
      repoRootFocus: isBroadRepoRootTask(previewTask, workspaceRoot),
      ...(skillProviderModel !== undefined ? { providerModel: skillProviderModel } : {}),
    });
    const { loop } = await composeAgentLoop(workspaceRoot, {
      model: provider,
      profile,
      toolRegistry,
      extensions,
      skillRunPolicy: mergeSkillRunPolicy(extensions.skillRunPolicy, {
        mode: "force",
        forceNames: [args.name],
        maxActive: 1,
        exclusiveForce: true,
        injectFullContent: true,
      }),
      runtime: buildCompactionRuntimeOverrides(provider.name, config),
    });
    const session = await runAgentSession({
      task: previewTask,
      profile,
      model: provider,
      loop,
      workspaceRoot,
    });
    console.log(renderTaskResult(session.task, session.result));
    return isAgentRunSuccessful(session.result) ? 0 : 1;
  }

  if ("command" in args && args.command === "agents") {
    const workspaceRoot = resolveWorkspace(resolve(args.cwd));
    const extensions = await loadWorkspaceExtensions(workspaceRoot);
    console.log(JSON.stringify(extensions.subagentManager.list(), null, 2));
    return 0;
  }

  if ("command" in args && args.command === "plugin") {
    const workspaceRoot = resolveWorkspace(resolve(args.cwd));
    const extensions = await loadWorkspaceExtensions(workspaceRoot);
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
    const server = await startApiServer(workspaceRoot, args.port);
    await new Promise<void>((resolvePromise) => {
      const shutdown = () => {
        server.close(() => resolvePromise());
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
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
    const extensions = await loadWorkspaceExtensions(workspaceRoot);
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

  const runArgs = args as RunCliArgs;
  const resolved = await resolveRunContext(runArgs);
  const useInteractiveApproval =
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    !runArgs.json &&
    !runArgs.jsonl;
  const terminalComposer = useInteractiveApproval
    ? new TerminalComposer({ promptOutput: process.stderr })
    : undefined;
  const printer = createProgressPrinter({
    ...(runArgs.json ? { json: true } : {}),
    ...(runArgs.jsonl ? { jsonl: true } : {}),
    ...(runArgs.verbose ? { verbose: true } : {}),
    ...(runArgs.trace ? { trace: true } : {}),
    ...(runArgs.debug ? { debug: true } : {}),
    ...(useInteractiveApproval
      ? {
          approvalPromptStyle: "inline" as const,
          interactiveTerminal: true,
          ...(terminalComposer === undefined ? {} : { terminalComposer }),
        }
      : {}),
  });
  const task = applyRecommendedMaxSteps(
    {
      id: createId("task"),
      text: resolved.taskText,
      cwd: resolved.workspaceRoot,
      mode: resolved.mode,
      maxSteps: resolved.maxSteps,
      metadata: {
        createdAt: nowIso(),
      },
      ...(resolved.model === undefined ? {} : { requestedModel: resolved.model }),
    },
    resolved.sessionRoot,
  );
  const workspaceRoot = resolved.sessionRoot;
  const { toolRegistry, extensions } = await loadComposedToolRegistry(workspaceRoot);
  const command = runArgs.task.startsWith("/")
    ? extensions.commandSystem.get(runArgs.task)
    : undefined;
  const skillPolicyResolution = resolveRunSkillPolicy(extensions.skillRunPolicy, {
    ...(runArgs.skill === undefined ? {} : { cliSkillName: runArgs.skill }),
    ...(command?.skill === undefined ? {} : { commandSkillName: command.skill }),
    lookupSkill: (name) => extensions.skillEngine.get(name),
  });
  if ("error" in skillPolicyResolution) {
    throw new ValidationError(skillPolicyResolution.error);
  }
  const skillRunPolicy =
    skillPolicyResolution.forceNames.length > 0
      ? skillPolicyResolution.policy
      : undefined;
  const primaryForcedSkill =
    skillPolicyResolution.forceNames.length > 0
      ? extensions.skillEngine.get(skillPolicyResolution.forceNames[0]!)
      : undefined;
  let resolvedMode = task.mode;
  if (command?.mode !== undefined && !runArgs.modeExplicit) {
    resolvedMode = command.mode;
  }
  if (primaryForcedSkill && !runArgs.modeExplicit) {
    resolvedMode = resolveSkillMode(primaryForcedSkill, resolvedMode, false);
  }
  const finalTask = command
    ? {
        ...task,
        text: `${command.content}\n\n${task.text}`,
        mode: resolvedMode,
      }
    : primaryForcedSkill
      ? { ...task, mode: resolvedMode }
      : task;
  const config = loadConfigForModel(resolved.model);
  cliExecuteLogDebug("Resolved run configuration.", {
    agentLogLevel: process.env.AGENT_LOG_LEVEL,
    defaultModel: config.defaultModel,
    requestedModel: resolved.model,
    workspaceRoot,
    sessionRoot: resolved.sessionRoot,
    mode: finalTask.mode,
    maxSteps: finalTask.maxSteps,
    planFirst: runArgs.planFirst === true,
    useWorktree: runArgs.useWorktree === true,
    resumeSessionId: resolved.resumeSessionId,
  });
  const provider = createModelProvider(config, resolved.model);
  const selectedModel = resolveSelectedModelConfig(
    resolved.model ?? config.defaultModel,
    config,
  );
  const headerDetails = await buildRunHeaderDetails({
    task: finalTask.text,
    mode: finalTask.mode,
    cwd: resolved.workspaceRoot,
    workspaceRoot,
    cliVersion: "0.1.0",
    modelProvider: selectedModel?.provider ?? provider.name,
    configuredModelName: selectedModel?.model ?? provider.name,
    toolCount: toolRegistry.getSchemasForMode(finalTask.mode).length,
    mcpServerCount: extensions.registry.listMcpServers().length,
    configLines: renderConfigPaths().split("\n"),
  });
  printer.printHeader(finalTask.text, finalTask.mode, resolved.workspaceRoot, headerDetails);
  if (terminalComposer) {
    terminalComposer.install();
    terminalComposer.attachPromptOnly(`${theme.dim("agent running")} `);
  }
  const runProviderModel = resolveProviderModel(resolved.model ?? config.defaultModel, config);
  const profile = createDefaultProfile(resolved.model ?? provider.name, {
    repoRootFocus: isBroadRepoRootTask(task, task.cwd),
    ...(runProviderModel !== undefined ? { providerModel: runProviderModel } : {}),
  });
  const cliPermissionPrompter = useInteractiveApproval
    ? new CliPermissionPrompter({
        ...(terminalComposer === undefined ? {} : { composer: terminalComposer }),
        onBeforePrompt: () => {
          printer.pauseForInput();
        },
        onAfterPrompt: () => {
          terminalComposer?.attachPromptOnly(`${theme.dim("agent running")} `);
        },
      })
    : undefined;
  const useInteractiveClarify =
    useInteractiveApproval && (finalTask.mode === "edit" || finalTask.mode === "agent");
  const cliClarifyPrompter = useInteractiveClarify
    ? new CliClarifyPrompter({
        ...(terminalComposer === undefined ? {} : { composer: terminalComposer }),
        onBeforePrompt: () => {
          printer.pauseForInput();
        },
        onAfterPrompt: () => {
          terminalComposer?.attachPromptOnly(`${theme.dim("agent running")} `);
        },
      })
    : undefined;
  const useInteractiveSkillConfirm =
    useInteractiveApproval &&
    skillRunPolicy === undefined &&
    (finalTask.mode === "edit" || finalTask.mode === "agent");
  const cliSkillConfirmPrompter = useInteractiveSkillConfirm
    ? new CliSkillConfirmPrompter({
        ...(terminalComposer === undefined ? {} : { composer: terminalComposer }),
        onBeforePrompt: () => {
          printer.pauseForInput();
        },
        onAfterPrompt: () => {
          terminalComposer?.attachPromptOnly(`${theme.dim("agent running")} `);
        },
      })
    : undefined;
  const { loop } = await composeAgentLoop(workspaceRoot, {
    model: provider,
    profile,
    toolRegistry,
    extensions,
    ...(skillRunPolicy === undefined ? {} : { skillRunPolicy }),
    runtime: buildCompactionRuntimeOverrides(provider.name, config),
    ...(cliPermissionPrompter === undefined
      ? {}
      : { permissionPrompter: cliPermissionPrompter }),
    ...(cliClarifyPrompter === undefined ? {} : { clarifyPrompter: cliClarifyPrompter }),
    ...(cliSkillConfirmPrompter === undefined
      ? {}
      : { skillConfirmPrompter: cliSkillConfirmPrompter }),
  });
  const session = await runAgentSession({
    task: finalTask,
    profile,
    model: provider,
    loop,
    workspaceRoot,
    sessionRoot: resolved.sessionRoot,
    ...(runArgs.planFirst ? { planFirst: true } : {}),
    ...(runArgs.useWorktree ? { useWorktree: true } : {}),
    ...(resolved.resumeSessionId === undefined
      ? {}
      : { resumeSessionId: resolved.resumeSessionId }),
    onEvent: printer.onEvent,
    ...(runArgs.planFirst && process.stdout.isTTY
      ? {
          approvePlan({ planText }) {
            return confirmAction(
              `${planText}\n\nApprove this plan and continue to execution?`,
            );
          },
        }
      : {}),
  });
  cliExecuteLogDebug("Completed CLI run.", {
    sessionId: session.result.sessionId,
    status: session.result.status,
    effectiveStatus: isAgentRunSuccessful(session.result) ? "success" : "non-success",
    steps: session.result.steps,
    planSessionId: session.planResult?.sessionId,
  });
  if (session.planResult && !runArgs.json && !runArgs.jsonl) {
    const planBlock = renderPlanBlock(session.planResult.finalText);
    if (terminalComposer?.isPinned()) {
      terminalComposer.writeAbove(planBlock);
    } else {
      process.stderr.write(planBlock);
    }
  } else if (finalTask.mode === "plan" && !runArgs.json && !runArgs.jsonl) {
    const planBlock = renderPlanBlock(session.result.finalText);
    if (terminalComposer?.isPinned()) {
      terminalComposer.writeAbove(planBlock);
    } else {
      process.stderr.write(planBlock);
    }
  }
  terminalComposer?.teardown();
  console.log(printer.renderResult(session.task, session.result));
  printer.dispose();
  return isAgentRunSuccessful(session.result) ? 0 : 1;
}

export async function executeDebugInfo(): Promise<number> {
  console.log(
    [
      "code-mind debug info",
      `  node: ${process.version}`,
      `  platform: ${process.platform}`,
      `  cwd: ${process.cwd()}`,
      renderConfigPaths(),
    ].join("\n"),
  );
  return 0;
}

export async function writeSessionListJson(
  workspaceRoot: string,
  outputPath?: string,
): Promise<number> {
  const json = await renderSessionListJson(workspaceRoot);
  if (outputPath) {
    await writeFile(outputPath, `${json}\n`, "utf8");
    console.log(`Wrote ${outputPath}`);
  } else {
    console.log(json);
  }
  return 0;
}
