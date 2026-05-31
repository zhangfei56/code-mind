import { stderr as composerOutput } from "node:process";
import { resolve } from "node:path";
import { loadConfigForModel } from "@code-mind/config";
import { createModelProvider } from "@code-mind/models";
import type {
  AgentResult,
  AgentEvent,
  SessionStatus,
  ActivityKind,
  UserTask,
} from "@code-mind/shared";
import { ValidationError } from "@code-mind/shared";
import { resolveWorkspace } from "@code-mind/workspace";
import { renderCliLogo } from "../cli/cli-logo.js";
import { createDefaultProfile } from "../ui/prompt.js";
import { renderTaskResult } from "../ui/render.js";
import { ProgressPrinter } from "../ui/progress-printer.js";
import { resolveDisplayMode } from "../ui/display-level.js";
import { getGitSummary } from "../ui/header-details.js";
import {
  renderReplComposerHints,
  renderReplHints,
  renderReplReasonSummary,
  renderReplThinkingPanel,
  renderReplUserLine,
} from "../ui/repl/repl-display.js";
import { formatFinalText } from "../ui/final-text.js";
import { theme } from "../ui/theme.js";
import { TerminalComposer } from "../ui/terminal-composer.js";
import {
  applyRecommendedMaxSteps,
  createOrchestrationSessionStore,
  getEffectiveResultStatus,
  isBroadRepoRootTask,
  runAgentSession,
} from "@code-mind/core";
import { createId, nowIso, type AgentMode } from "@code-mind/shared";
import { createCliAgentLoop } from "../cli/runtime-deps.js";
import { createInteractivePlanApprovalHandler } from "./plan-approval.js";
import { ApprovalCoordinator, formatApprovalRecord } from "./approval-coordinator.js";
import {
  parseInteractiveCommand,
  renderInteractiveHelp,
  renderAgentEvent,
  renderInteractiveStatus,
  type InteractiveState,
} from "./commands.js";
import {
  applyInteractiveActivity,
  createEmptyActivityState,
  renderInteractiveActivityPanel,
  renderInteractiveContext,
  renderInteractiveCost,
  renderInteractiveDiff,
  renderInteractiveExpand,
  renderInteractivePermissions,
  renderInteractiveTools,
} from "./session-views.js";

export interface StartInteractiveOptions {
  cwd: string;
  model?: string;
  mode: AgentMode;
  maxSteps: number;
  initialSessionId?: string;
}

function renderTurnResult(
  result: AgentResult,
  task: UserTask,
  level: 0 | 1 | 2,
  options: { skipBody?: boolean } = {},
): string {
  return renderTaskResult(task, result, { level, ...options });
}

async function renderSessionList(workspaceRoot: string): Promise<string> {
  const manifests = await createOrchestrationSessionStore(workspaceRoot).listSessionManifests();
  if (manifests.length === 0) {
    return "No sessions.";
  }
  return manifests
    .slice(0, 10)
    .map((item) => `${item.id}  ${item.status}  ${item.updatedAt}  ${item.task}`)
    .join("\n");
}

export async function startInteractiveShell(options: StartInteractiveOptions): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new ValidationError("Interactive mode requires a TTY.");
  }

  const config = loadConfigForModel(options.model);
  const initialProvider = createModelProvider(config, options.model);

  const state: InteractiveState = {
    cwd: resolveWorkspace(resolve(options.cwd)),
    model: options.model ?? initialProvider.name,
    mode: options.mode,
    maxSteps: options.maxSteps,
    sessionId: options.initialSessionId,
    sessionStatus: "idle",
    hasActiveTurn: false,
    currentStep: 0,
    currentActivity: "thinking",
    currentAction: "idle",
    recentEvents: [],
    verbose: false,
    ...createEmptyActivityState(),
  };

  const composer = new TerminalComposer({ promptOutput: composerOutput });
  const approvalManager = new ApprovalCoordinator(state.cwd, {
    emitMessage: (message) => {
      composer.writeAbove(`${message}\n`);
    },
  });
  let activeTurnAbortController: AbortController | undefined;
  let activeTurnPromise: Promise<void> | undefined;
  console.log(renderCliLogo().trimEnd());
  console.log(theme.dim("Interactive REPL · type /help for commands · /exit to quit"));
  if (options.initialSessionId) {
    console.log(theme.dim(`Resumed session ${options.initialSessionId}`));
  }
  console.log(renderReplComposerHints());

  const refreshComposerPrompt = (): void => {
    composer.setPrompt(
      approvalManager.hasPendingApprovals() ? buildApprovalPrompt() : buildPrompt(state),
    );
  };

  try {
    composer.install();
    refreshComposerPrompt();
    return await new Promise<number>((resolve) => {
      composer.startLineListener(async (answer) => {
        const line = answer.trim();

        if (!line) {
          if (!state.verbose && state.replThinkingExpand) {
            composer.writeAbove(`${state.replThinkingExpand()}\n`);
          }
          refreshComposerPrompt();
          return;
        }

        if (!line.startsWith("/") && approvalManager.hasPendingApprovals()) {
          const handled = await approvalManager.resolveFromUserInput(line, state.sessionId);
          if (!handled) {
            composer.writeAbove(
              "Approval pending — reply [y] once, [a] always, [n] no, or use /approve /deny.\n",
            );
          }
          refreshComposerPrompt();
          return;
        }

        if (line.startsWith("/")) {
          const shouldExit = await runInteractiveCommand(
            state,
            approvalManager,
            activeTurnAbortController,
            line,
            composer,
          );
          if (shouldExit) {
            composer.teardown();
            resolve(0);
            return;
          }
          refreshComposerPrompt();
          return;
        }

        if (activeTurnPromise && !approvalManager.hasPendingApprovals()) {
          composer.writeAbove("Turn running — wait for completion or /abort.\n");
          refreshComposerPrompt();
          return;
        }

        activeTurnAbortController = new AbortController();
        state.hasActiveTurn = true;
        state.sessionStatus = "running";
        state.currentStep = 0;
        state.currentActivity = "thinking";
        state.currentAction = "starting turn";
        state.recentEvents = [];
        activeTurnPromise = runInteractiveTurn(
          state,
          line,
          approvalManager,
          activeTurnAbortController.signal,
          composer,
          (status) => {
            state.sessionStatus = status;
          },
        )
          .then(({ task, result, contentStreamed }) => {
            if (state.verbose) {
              composer.writeAbove(
                `${renderTurnResult(result, task, 2, { skipBody: contentStreamed })}\n`,
              );
              composer.writeAbove(`${renderInteractiveActivityPanel(state)}\n`);
            } else {
              if (!contentStreamed) {
                const body = formatFinalText(result.summary ?? result.finalText, { level: 1 });
                if (body.trim()) {
                  composer.writeAbove(`${theme.blue("assistant")}\n  ${body.trim()}\n\n`);
                }
              }
              composer.writeAbove(`${renderReplHints()}\n`);
            }
            state.sessionId = result.sessionId;
            state.sessionStatus = getEffectiveResultStatus(result);
            state.currentStep = result.steps;
            state.currentActivity =
              (result.metadata?.activitySummary?.last as ActivityKind | undefined) ??
              state.currentActivity;
            state.currentAction = getEffectiveResultStatus(result);
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            composer.writeAbove(`${message}\n`);
            state.sessionStatus = "failed";
            state.currentAction = "failed";
          })
          .finally(() => {
            state.hasActiveTurn = false;
            activeTurnAbortController = undefined;
            activeTurnPromise = undefined;
            if (state.sessionStatus === "running" || state.sessionStatus === "retrying") {
              state.sessionStatus = "idle";
            }
            refreshComposerPrompt();
          });
        refreshComposerPrompt();
      });
    });
  } finally {
    composer.teardown();
  }
}

function buildPrompt(_state: InteractiveState): string {
  return `${theme.dim("›")} `;
}

function buildApprovalPrompt(): string {
  return `${theme.yellow("approval")} ${theme.dim("›")} `;
}

async function runInteractiveCommand(
  state: InteractiveState,
  approvalManager: ApprovalCoordinator,
  activeTurnAbortController: AbortController | undefined,
  inputLine: string,
  composer?: TerminalComposer,
): Promise<boolean> {
  const emit = (text: string): void => {
    if (composer?.isPinned()) {
      composer.writeAbove(`${text}\n`);
      return;
    }
    console.log(text);
  };
  const command = parseInteractiveCommand(inputLine);
  switch (command.type) {
    case "help":
      emit(renderInteractiveHelp());
      return false;
    case "exit":
      return true;
    case "status":
      emit(renderInteractiveStatus(state));
      emit("");
      emit(renderInteractiveActivityPanel(state));
      return false;
    case "new":
      state.sessionId = undefined;
      state.sessionStatus = "idle";
      state.currentStep = 0;
      state.currentActivity = "thinking";
      state.currentAction = "idle";
      state.recentEvents = [];
      Object.assign(state, createEmptyActivityState());
      emit("Started a new interactive session context.");
      return false;
    case "sessions":
      emit(await renderSessionList(state.cwd));
      return false;
    case "abort":
      if (!activeTurnAbortController || !state.hasActiveTurn) {
        emit("No active turn to abort.");
        return false;
      }
      activeTurnAbortController.abort(new Error("Aborted by user."));
      state.sessionStatus = "cancelled";
      emit("Abort requested.");
      return false;
    case "approvals":
      if (!state.sessionId) {
        emit(await approvalManager.renderPendingApprovals());
        return false;
      }
      emit(await approvalManager.renderPendingApprovals(state.sessionId));
      return false;
    case "approve":
      emit(await approvalManager.approve(command.approvalId, state.sessionId));
      return false;
    case "approve_always":
      emit(await approvalManager.approveAlways(command.approvalId, state.sessionId));
      return false;
    case "deny":
      emit(await approvalManager.deny(command.approvalId, state.sessionId));
      return false;
    case "resume": {
      const manifest = await createOrchestrationSessionStore(state.cwd).readManifest(
        command.sessionId,
      );
      state.sessionId = manifest.id;
      state.mode = manifest.mode;
      state.model = manifest.model;
      state.sessionStatus = manifest.status;
      state.currentActivity = "thinking";
      state.currentAction = `resumed ${manifest.status}`;
      emit(`Resumed session ${manifest.id}.`);
      return false;
    }
    case "model":
      state.model = command.model;
      emit(`Model set to ${command.model}.`);
      return false;
    case "cwd":
      state.cwd = resolveWorkspace(command.cwd);
      approvalManager.setWorkspaceRoot(state.cwd);
      state.sessionId = undefined;
      state.sessionStatus = "idle";
      state.currentStep = 0;
      state.currentActivity = "thinking";
      state.currentAction = "idle";
      state.recentEvents = [];
      Object.assign(state, createEmptyActivityState());
      emit(`Workspace set to ${state.cwd}.`);
      return false;
    case "max_steps":
      state.maxSteps = command.maxSteps;
      emit(`Max steps set to ${command.maxSteps}.`);
      return false;
    case "verbose":
      state.verbose = !state.verbose;
      emit(`Verbose progress ${state.verbose ? "enabled" : "disabled"}.`);
      return false;
    case "diff":
      emit(await renderInteractiveDiff(state));
      return false;
    case "context":
      emit(renderInteractiveContext(state));
      return false;
    case "cost":
      emit(renderInteractiveCost(state));
      return false;
    case "tools":
      emit(await renderInteractiveTools(state.mode));
      return false;
    case "permissions":
      emit(renderInteractivePermissions(state.mode));
      return false;
    case "expand":
      emit(renderInteractiveExpand(state));
      return false;
    case "reason":
      emit(state.replReasonExpand?.() ?? "No reasoning summary available yet.");
      return false;
  }
}

async function runInteractiveTurn(
  state: InteractiveState,
  text: string,
  approvalManager: ApprovalCoordinator,
  abortSignal: AbortSignal,
  composer: TerminalComposer,
  onStatusChange: (status: SessionStatus) => void,
): Promise<{ task: UserTask; result: AgentResult; contentStreamed: boolean }> {
  const config = loadConfigForModel(state.model);
  const provider = createModelProvider(config, state.model);
  const task = applyRecommendedMaxSteps(
    {
      id: createId("task"),
      text,
      cwd: state.cwd,
      mode: state.mode,
      maxSteps: state.maxSteps,
      metadata: {
        createdAt: nowIso(),
        source: "interactive",
      },
      ...(state.model === undefined ? {} : { requestedModel: state.model }),
    },
    state.cwd,
  );
  const profile = createDefaultProfile(state.model ?? provider.name, {
    repoRootFocus: isBroadRepoRootTask(task, state.cwd),
  });
  const { loop } = await createCliAgentLoop(state.cwd, provider, profile, {
    config,
    modelKey: state.model ?? provider.name,
    permissionPrompter: {
      approve(sessionId, toolCall, decision, options) {
        return approvalManager.request(sessionId, toolCall, decision.reason, {
          ...(options?.onPending === undefined
            ? {}
            : { onPending: options.onPending }),
        });
      },
    },
  });
  const gitSummary = await getGitSummary(state.cwd);
  composer.writeAbove(`${renderReplUserLine(text)}\n`);
  const printer = new ProgressPrinter({
    level: resolveDisplayMode({
      verbose: state.verbose,
      interactive: !state.verbose,
    }),
    surface: state.verbose ? "run" : "repl",
    interactiveTerminal: true,
    terminalComposer: composer,
    replContext: {
      mode: state.mode,
      model: state.model ?? provider.name,
      cwd: state.cwd,
      ...(gitSummary === undefined ? {} : { gitSummary }),
    },
    approvalPromptStyle: "repl",
  });
  state.journalExpand = () => printer.expandLastFoldedStep();
  state.replThinkingExpand = () => {
    const replState = printer.getReplDisplayState();
    return replState ? renderReplThinkingPanel(replState) : "No active thinking state.";
  };
  state.replReasonExpand = () => {
    const replState = printer.getReplDisplayState();
    return replState ? renderReplReasonSummary(replState) : "No reasoning summary available yet.";
  };
  try {
    const session = await runAgentSession({
      task,
      profile,
      model: provider,
      loop,
      workspaceRoot: state.cwd,
      abortSignal,
      onStatusChange,
      onEvent: async (event) => {
        applyInteractiveEvent(state, event);
        await printer.onEvent(event);
        if (event.kind === "approval.requested") {
          composer.setPrompt(buildApprovalPrompt());
          composer.refreshPrompt();
        } else if (event.kind === "approval.resolved") {
          composer.setPrompt(buildPrompt(state));
          composer.refreshPrompt();
        }
        const shellOutput = printer.getLastShellOutput();
        if (shellOutput) {
          state.lastShellOutput = shellOutput;
        }
      },
      ...(state.sessionId === undefined ? {} : { resumeSessionId: state.sessionId }),
      ...(state.mode === "ask"
        ? {}
        : { approvePlan: createInteractivePlanApprovalHandler() }),
    });
    return { task, result: session.result, contentStreamed: printer.hasStreamedContent() };
  } finally {
    printer.dispose();
  }
}

function applyInteractiveEvent(state: InteractiveState, event: AgentEvent): void {
  applyInteractiveActivity(state, event);
  const p = event.payload;

  switch (event.kind) {
    case "turn.started":
      state.sessionId = event.sessionId;
      state.currentAction = `starting ${typeof p.modelName === "string" ? p.modelName : "model"}`;
      break;
    case "activity.updated": {
      if (typeof p.activity === "string") {
        state.currentActivity = p.activity as ActivityKind;
      }
      if (p.detail !== undefined && typeof p.detail === "string") {
        state.activityDetail = p.detail;
      } else {
        delete state.activityDetail;
      }
      state.currentAction =
        p.detail !== undefined && typeof p.detail === "string"
          ? `${state.currentActivity} · ${p.detail}`
          : `${state.currentActivity}`;
      break;
    }
    case "closing_turn.started":
      state.currentActivity = "summarizing";
      state.currentAction = "summarizing";
      break;
    case "step.started":
      state.currentStep = typeof p.step === "number" ? p.step : 0;
      state.currentAction = `step ${p.step}/${p.maxSteps}`;
      break;
    case "model.request":
      state.currentAction = `thinking at step ${p.step}/${p.maxSteps}`;
      break;
    case "model.response": {
      const count = typeof p.toolCallCount === "number" ? p.toolCallCount : 0;
      state.currentAction =
        count > 0 ? `planning ${count} tool call(s)` : "preparing final response";
      break;
    }
    case "tool.call": {
      const tc = p.toolCall;
      let name = "tool";
      if (typeof tc === "object" && tc !== null && typeof (tc as { name?: unknown }).name === "string") {
        name = (tc as { name: string }).name;
      }
      state.currentAction = `running ${name}`;
      break;
    }
    case "tool.result": {
      const tc = p.toolCall;
      let name = "tool";
      if (typeof tc === "object" && tc !== null && typeof (tc as { name?: unknown }).name === "string") {
        name = (tc as { name: string }).name;
      }
      state.currentAction = p.success === true ? `finished ${name}` : `failed ${name}`;
      break;
    }
    case "subagent.spawned": {
      const agentName = typeof p.agentName === "string" ? p.agentName : "subagent";
      const task = typeof p.task === "string" ? p.task : "";
      state.currentActivity = "delegating";
      state.activityDetail = `${agentName} · ${task.slice(0, 80)}`;
      state.currentAction = `delegating · ${agentName}`;
      break;
    }
    case "subagent.finished": {
      const agentName = typeof p.agentName === "string" ? p.agentName : "subagent";
      state.currentAction =
        p.success === true
          ? `subagent ${agentName} finished`
          : `subagent ${agentName} failed`;
      break;
    }
    case "approval.requested": {
      const tc = p.toolCall;
      let name = "tool";
      if (typeof tc === "object" && tc !== null && typeof (tc as { name?: unknown }).name === "string") {
        name = (tc as { name: string }).name;
      }
      state.currentAction = `waiting approval for ${name}`;
      break;
    }
    case "verification.started":
      state.currentAction = "running verification";
      break;
    case "verification.finished":
      state.currentAction = p.passed === true ? "verification passed" : "verification failed";
      break;
    case "turn.finished":
      state.currentStep = typeof p.steps === "number" ? p.steps : 0;
      state.currentAction = typeof p.status === "string" ? p.status : "unknown";
      break;
    default:
      break;
  }

  const rendered = renderAgentEvent(event);
  if (rendered) {
    state.recentEvents.push(rendered);
    state.recentEvents = state.recentEvents.slice(-8);
  }
}
