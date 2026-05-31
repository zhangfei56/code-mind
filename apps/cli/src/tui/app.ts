import blessed from "blessed";
import { resolve } from "node:path";
import { loadConfigForModel } from "@code-mind/config";
import { createModelProvider } from "@code-mind/models";
import type {
  AgentEvent,
  AgentMode,
  AgentResult,
  UserTask,
} from "@code-mind/shared";
import { DEFAULT_MAX_STEPS } from "@code-mind/shared";
import { createId, nowIso, ValidationError } from "@code-mind/shared";
import { resolveWorkspace } from "@code-mind/workspace";
import { GitManager } from "@code-mind/execution";
import {
  applyRecommendedMaxSteps,
  buildRuntimePlan,
  getEffectiveResultStatus,
  isBroadRepoRootTask,
  runAgentSession,
} from "@code-mind/core";
import { createDefaultProfile } from "../ui/prompt.js";
import { getGitSummary } from "../ui/header-details.js";
import { shortPath } from "../ui/theme.js";
import { createCliAgentLoop } from "../cli/runtime-deps.js";
import { formatFinalText } from "../ui/final-text.js";
import { ApprovalCoordinator } from "../interactive/approval-coordinator.js";
import {
  completeSlashCommand,
  listSlashCommandMatches,
  renderSlashCommandCompletions,
} from "./commands.js";
import {
  addConversation,
  applyTuiEvent,
  createTuiState,
  setAgentPlan,
  setPendingApproval,
  type TuiOverlayPanel,
  type TuiState,
} from "./state.js";
import {
  inputPromptText,
  isApprovalActive,
  overlayBorderColor,
  overlayTitle,
  renderFixedToast,
  renderApprovalModal,
  renderTuiMainContent,
  renderTuiOverlay,
  renderTuiStatusLine,
  resolveOverlayForSelection,
  selectableRowCount,
  type TuiOverlayContext,
} from "./presentation.js";

type ScrollableBox = blessed.Widgets.BoxElement & {
  scroll(offset: number): void;
  setScroll(offset: number): void;
  setScrollPerc(percent: number): void;
};

export interface StartTuiOptions {
  cwd: string;
  model?: string;
  mode: AgentMode;
  maxSteps: number;
  initialTask?: string;
  initialSessionId?: string;
}

interface PendingPlan {
  text: string;
  resolve: (approved: boolean) => void;
}

export async function startTuiShell(options: StartTuiOptions): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new ValidationError("TUI mode requires a TTY.");
  }

  const config = loadConfigForModel(options.model);
  const provider = createModelProvider(config, options.model);
  const cwd = resolveWorkspace(resolve(options.cwd));
  const gitSummary = await getGitSummary(cwd);
  const state = createTuiState({
    cwd,
    model: options.model ?? provider.name,
    mode: options.mode,
    ...(gitSummary === undefined ? {} : { gitSummary }),
  });
  if (options.initialSessionId !== undefined) {
    state.sessionId = options.initialSessionId;
  }

  const app = new CodeMindTuiApp(state, options);
  await app.start();
  return app.exitCode;
}

export async function startTuiPreview(input: {
  cwd: string;
  model: string;
  mode: AgentMode;
  taskText: string;
  events: AgentEvent[];
  delayMs?: number;
}): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new ValidationError("TUI preview requires a TTY.");
  }
  const cwd = resolveWorkspace(resolve(input.cwd));
  const gitSummary = await getGitSummary(cwd);
  const state = createTuiState({
    cwd,
    model: input.model,
    mode: input.mode,
    ...(gitSummary === undefined ? {} : { gitSummary }),
  });
  addConversation(state, "user", input.taskText);
  const app = new CodeMindTuiApp(state, {
    cwd,
    mode: input.mode,
    model: input.model,
    maxSteps: DEFAULT_MAX_STEPS,
  });
  void app.replayEvents(input.events, input.delayMs ?? 250);
  await app.start();
  return app.exitCode;
}

class CodeMindTuiApp {
  private readonly screen: blessed.Widgets.Screen;
  private readonly status: blessed.Widgets.BoxElement;
  private readonly main: blessed.Widgets.BoxElement;
  private readonly backdrop: blessed.Widgets.BoxElement;
  private readonly overlay: blessed.Widgets.BoxElement;
  private readonly approvalModal: blessed.Widgets.BoxElement;
  private readonly completion: blessed.Widgets.BoxElement;
  private readonly toast: blessed.Widgets.BoxElement;
  private readonly inputPrompt: blessed.Widgets.BoxElement;
  private readonly input: blessed.Widgets.TextboxElement;
  private readonly approvalManager: ApprovalCoordinator;
  private activeTurnAbortController: AbortController | undefined;
  private activeTurnPromise: Promise<void> | undefined;
  private activeTurnHeartbeat: ReturnType<typeof setInterval> | undefined;
  private pendingPlan: PendingPlan | undefined;
  private completionSeed: string | undefined;
  private tabCompletionIndex = 0;
  private followOutput = true;
  private readonly inputHistory: string[] = [];
  private historyIndex: number | undefined;
  exitCode = 0;

  constructor(
    private readonly state: TuiState,
    private readonly options: StartTuiOptions,
  ) {
    this.screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true,
      mouse: true,
      title: "code-mind",
      dockBorders: false,
    });
    this.status = blessed.box({
      top: 0,
      left: 0,
      width: "100%",
      height: 1,
      tags: true,
      style: { fg: "white", bg: "black" },
      content: "",
    });
    this.main = blessed.box({
      top: 1,
      left: 0,
      width: "100%",
      bottom: 5,
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      scrollbar: {
        ch: " ",
        track: { bg: "black" },
        style: { bg: "cyan" },
      },
      padding: { left: 1, right: 1 },
      style: { fg: "white", bg: "black" },
    });
    this.backdrop = blessed.box({
      hidden: true,
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      tags: true,
      style: { bg: "black" },
      content: "",
    });
    this.overlay = blessed.box({
      hidden: true,
      top: "center",
      left: "center",
      width: "88%",
      height: "62%",
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      scrollbar: {
        ch: " ",
        track: { bg: "black" },
        style: { bg: "yellow" },
      },
      border: { type: "line" },
      padding: { left: 1, right: 1 },
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "yellow" },
      },
    });
    this.approvalModal = blessed.box({
      hidden: true,
      top: "center",
      left: "center",
      width: "72%",
      height: "48%",
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      scrollbar: {
        ch: " ",
        track: { bg: "black" },
        style: { bg: "yellow" },
      },
      border: { type: "line" },
      padding: { left: 1, right: 1 },
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "yellow" },
      },
    });
    this.completion = blessed.box({
      hidden: true,
      bottom: 5,
      left: 0,
      width: "100%",
      height: 8,
      tags: true,
      border: { type: "line" },
      padding: { left: 1, right: 1 },
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "cyan" },
      },
    });
    this.toast = blessed.box({
      bottom: 4,
      left: 0,
      width: "100%",
      height: 1,
      tags: true,
      padding: { left: 1 },
      content: "",
      style: { fg: "gray", bg: "black" },
    });
    this.inputPrompt = blessed.box({
      bottom: 3,
      left: 0,
      width: "100%",
      height: 1,
      tags: true,
      padding: { left: 1 },
      content: inputPromptText(this.state),
      style: { fg: "gray", bg: "black" },
    });
    this.input = blessed.textbox({
      label: " INPUT ",
      bottom: 0,
      left: 0,
      width: "100%",
      height: 3,
      tags: true,
      keys: true,
      inputOnFocus: true,
      border: { type: "line" },
      padding: { left: 1, right: 1 },
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "yellow" },
        focus: { fg: "white", bg: "black" },
      },
    });
    this.approvalManager = new ApprovalCoordinator(state.cwd, {
      onApprovalRequested: (approval) => {
        setPendingApproval(this.state, approval);
        this.showApprovalModal();
      },
    });
  }

  async start(): Promise<void> {
    this.screen.append(this.status);
    this.screen.append(this.main);
    this.screen.append(this.backdrop);
    this.screen.append(this.overlay);
    this.screen.append(this.approvalModal);
    this.screen.append(this.completion);
    this.screen.append(this.toast);
    this.screen.append(this.inputPrompt);
    this.screen.append(this.input);
    this.bindKeys();
    this.render();
    this.input.focus();

    if (this.options.initialTask?.trim()) {
      await this.submit(this.options.initialTask.trim());
    }

    await new Promise<void>((resolve) => {
      this.screen.once("destroy", resolve);
    });
  }

  async replayEvents(events: AgentEvent[], delayMs: number): Promise<void> {
    await sleep(150);
    for (const event of events) {
      applyTuiEvent(this.state, event);
      this.render();
      await sleep(delayMs);
    }
    this.state.toast = "Mock replay complete. Press /exit or Ctrl+C to close.";
    this.render();
  }

  private bindKeys(): void {
    this.screen.key(["C-c"], () => {
      if (this.activeTurnAbortController) {
        this.activeTurnAbortController.abort(new Error("Aborted by user."));
        this.state.toast = "Abort requested.";
        this.render();
        return;
      }
      this.shutdown(0);
    });
    this.screen.key(["C-l"], () => {
      this.main.setContent("");
      this.render();
    });
    const scrollUp = () => this.scrollActive(-3);
    const scrollDown = () => this.scrollActive(3);
    const pageUp = () => this.scrollActive(-Math.max(4, Math.floor(Number(this.screen.height) / 2)));
    const pageDown = () => this.scrollActive(Math.max(4, Math.floor(Number(this.screen.height) / 2)));
    const top = () => this.scrollActiveTo("top");
    const bottom = () => this.scrollActiveTo("bottom");
    this.screen.key(["S-up"], scrollUp);
    this.screen.key(["S-down"], scrollDown);
    this.screen.key(["pageup"], pageUp);
    this.screen.key(["pagedown"], pageDown);
    this.screen.key(["home"], top);
    this.screen.key(["end"], bottom);
    this.input.key(["pageup"], pageUp);
    this.input.key(["pagedown"], pageDown);
    this.input.key(["home"], top);
    this.input.key(["end"], bottom);
    this.input.key(["C-u"], () => {
      this.input.clearValue();
      this.completionSeed = undefined;
      this.tabCompletionIndex = 0;
      this.completion.hide();
      this.input.focus();
      this.render();
    });
    this.input.key(["C-p"], () => this.showInputHistory(-1));
    this.input.key(["C-n"], () => this.showInputHistory(1));
    this.main.on("wheeldown", scrollDown);
    this.main.on("wheelup", scrollUp);
    this.overlay.on("wheeldown", scrollDown);
    this.overlay.on("wheelup", scrollUp);
    this.approvalModal.on("wheeldown", scrollDown);
    this.approvalModal.on("wheelup", scrollUp);
    this.screen.key(["escape", "q"], () => {
      if (this.isApprovalModalVisible()) {
        if (!this.state.pendingApproval && !this.pendingPlan) {
          this.hideApprovalModal();
        }
        this.input.focus();
        return;
      }
      if (this.state.overlay) {
        this.closeOverlay();
        return;
      }
      this.input.focus();
    });
    this.screen.key(["y", "a", "n", "e"], (_ch, key) => {
      if (!this.isApprovalModalVisible() && !this.pendingPlan) {
        return;
      }
      const name = key.name;
      if (name === "e" && this.state.pendingApproval) {
        this.hideApprovalModal();
        this.openOverlay("reason");
        return;
      }
      if (name === "y") {
        void this.resolveApproval(true, false);
      } else if (name === "a") {
        void this.resolveApproval(true, true);
      } else if (name === "n") {
        void this.resolveApproval(false, false);
      }
    });
    this.screen.key(["up"], () => {
      if (this.state.overlay || this.isApprovalModalVisible()) {
        return;
      }
      this.state.selectedRow = Math.max(0, this.state.selectedRow - 1);
      this.render();
    });
    this.screen.key(["down"], () => {
      if (this.state.overlay || this.isApprovalModalVisible()) {
        return;
      }
      this.state.selectedRow = Math.min(selectableRowCount(this.state) - 1, this.state.selectedRow + 1);
      this.render();
    });
    this.screen.key(["tab"], () => this.completeInput());
    this.input.key(["tab"], () => this.completeInput());
    this.screen.key(["r"], () => {
      if (this.state.overlay === "thinking") {
        this.openOverlay("reason");
      }
    });
    this.screen.key(["e"], () => {
      if (this.state.overlay === "thinking" || this.state.overlay === "reason") {
        void this.openEvidenceOverlay();
      }
    });
    this.screen.key(["d"], () => {
      if (this.state.overlay === "reason") {
        void this.openEvidenceOverlay();
      }
    });
    this.input.on("submit", (value: string) => {
      this.tabCompletionIndex = 0;
      this.completion.hide();
      void this.submit(value.trim());
    });
    this.input.on("keypress", (_ch, key) => {
      if (key?.name === "tab") {
        return;
      }
      this.completionSeed = undefined;
      this.tabCompletionIndex = 0;
      setTimeout(() => {
        this.render();
      }, 0);
    });
  }

  private activeScrollable(): ScrollableBox {
    if (this.isApprovalModalVisible()) {
      return this.approvalModal as ScrollableBox;
    }
    if (this.state.overlay) {
      return this.overlay as ScrollableBox;
    }
    return this.main as ScrollableBox;
  }

  private scrollActive(offset: number): void {
    this.followOutput = false;
    this.activeScrollable().scroll(offset);
    this.render();
  }

  private scrollActiveTo(position: "top" | "bottom"): void {
    const target = this.activeScrollable();
    if (position === "top") {
      this.followOutput = false;
      target.setScroll(0);
    } else {
      this.followOutput = true;
      target.setScrollPerc(100);
    }
    this.render();
  }

  private showInputHistory(direction: -1 | 1): void {
    if (this.inputHistory.length === 0) {
      return;
    }
    if (this.historyIndex === undefined) {
      this.historyIndex = direction < 0 ? this.inputHistory.length - 1 : 0;
    } else {
      this.historyIndex = Math.min(
        this.inputHistory.length - 1,
        Math.max(0, this.historyIndex + direction),
      );
    }
    this.input.setValue(this.inputHistory[this.historyIndex] ?? "");
    this.input.focus();
    this.render();
  }

  private isApprovalModalVisible(): boolean {
    return !this.approvalModal.hidden;
  }

  private showApprovalModal(): void {
    this.state.overlay = null;
    this.overlay.hide();
    this.backdrop.show();
    this.approvalModal.show();
    this.render();
  }

  private hideApprovalModal(): void {
    this.backdrop.hide();
    this.approvalModal.hide();
    this.state.overlay = null;
    this.render();
    this.input.focus();
  }

  private openOverlay(panel: TuiOverlayPanel): void {
    this.backdrop.hide();
    this.approvalModal.hide();
    this.state.overlay = panel;
    if (panel === "evidence") {
      void this.refreshDiffSummary();
    }
    this.render();
  }

  private async openEvidenceOverlay(): Promise<void> {
    await this.refreshDiffSummary();
    this.openOverlay("evidence");
  }

  private closeOverlay(): void {
    this.state.overlay = null;
    this.backdrop.hide();
    this.overlay.hide();
    this.render();
    this.input.focus();
  }

  private async refreshDiffSummary(): Promise<void> {
    try {
      const git = new GitManager();
      const changed = await git.changedFiles(this.state.cwd);
      const lines = ["Diff summary", ""];
      for (const path of changed.untracked) {
        lines.push(`  A ${shortPath(path)}`);
      }
      for (const path of changed.modified) {
        lines.push(`  M ${shortPath(path)}`);
      }
      for (const path of changed.deleted) {
        lines.push(`  D ${shortPath(path)}`);
      }
      if (lines.length === 2) {
        this.state.diffSummary = "No workspace changes detected.";
      } else {
        lines.push("", "Use git diff for full patch output.");
        this.state.diffSummary = lines.join("\n");
      }
    } catch {
      this.state.diffSummary = "Unable to read workspace diff.";
    }
  }

  private async submit(value: string): Promise<void> {
    this.input.clearValue();
    this.input.focus();
    this.historyIndex = undefined;
    if (!value) {
      if (this.isApprovalModalVisible()) {
        await this.resolveApproval(true, false);
        return;
      }
      if (!this.state.pendingApproval && !this.pendingPlan) {
        this.openOverlay(resolveOverlayForSelection(this.state));
      }
      return;
    }
    if ((this.state.pendingApproval || this.pendingPlan) && ["y", "yes"].includes(value.toLowerCase())) {
      await this.resolveApproval(true, false);
      return;
    }
    if ((this.state.pendingApproval || this.pendingPlan) && ["a", "always"].includes(value.toLowerCase())) {
      await this.resolveApproval(true, true);
      return;
    }
    if ((this.state.pendingApproval || this.pendingPlan) && ["n", "no"].includes(value.toLowerCase())) {
      await this.resolveApproval(false, false);
      return;
    }
    if (value.toLowerCase() === "e" && this.isApprovalModalVisible() && this.state.pendingApproval) {
      this.hideApprovalModal();
      this.openOverlay("reason");
      return;
    }
    if (value.startsWith("/")) {
      this.pushInputHistory(value);
      await this.runCommand(value);
      return;
    }
    if (this.activeTurnPromise) {
      this.state.toast = "A turn is already running. Use /abort.";
      this.render();
      return;
    }
    this.pushInputHistory(value);
    await this.runTurn(value);
  }

  private pushInputHistory(value: string): void {
    if (!value.trim()) {
      return;
    }
    if (this.inputHistory[this.inputHistory.length - 1] !== value) {
      this.inputHistory.push(value);
      this.inputHistory.splice(0, Math.max(0, this.inputHistory.length - 80));
    }
  }

  private completeInput(): void {
    const current = this.input.getValue().trim();
    if (current.startsWith("/")) {
      const seed = this.completionSeed ?? current;
      const matches = listSlashCommandMatches(seed);
      if (matches.length === 0) {
        this.completionSeed = undefined;
        this.state.toast = `No command matches: ${current}`;
        this.render();
        return;
      }
      const completed = completeSlashCommand(seed, this.tabCompletionIndex);
      this.completionSeed = seed;
      this.tabCompletionIndex += 1;
      this.input.setValue(completed);
      this.input.focus();
      this.state.toast =
        matches.length > 1
          ? `Command matches: ${matches.map((command) => `/${command}`).join("  ")}`
          : `Completed command: ${completed}`;
      this.render();
      return;
    }
    if (!this.state.overlay && !this.isApprovalModalVisible()) {
      this.openOverlay("help");
    } else {
      this.input.focus();
      this.render();
    }
  }

  private async runCommand(value: string): Promise<void> {
    const [command, ...rest] = value.slice(1).split(/\s+/).filter(Boolean);
    switch (command) {
      case "exit":
      case "quit":
        this.shutdown(0);
        return;
      case "help":
        this.openOverlay("help");
        break;
      case "status":
        this.openOverlay("status");
        break;
      case "context":
        this.openOverlay("context");
        break;
      case "reason":
        this.openOverlay("reason");
        break;
      case "diff":
      case "evidence":
        await this.openEvidenceOverlay();
        break;
      case "events":
        this.openOverlay("events");
        break;
      case "expand":
        this.state.showAllActivity = true;
        this.state.toast = "Expanded recent events.";
        break;
      case "permissions":
        this.openOverlay("permissions");
        break;
      case "approvals":
        this.showApprovalModal();
        this.state.toast = await this.approvalManager.renderPendingApprovals(this.state.sessionId);
        break;
      case "approve":
        this.state.toast = await this.approvalManager.approve(rest[0], this.state.sessionId);
        delete this.state.pendingApproval;
        this.hideApprovalModal();
        break;
      case "approve-always":
      case "approve_always":
        this.state.toast = await this.approvalManager.approveAlways(rest[0], this.state.sessionId);
        delete this.state.pendingApproval;
        this.hideApprovalModal();
        break;
      case "deny":
        this.state.toast = await this.approvalManager.deny(rest[0], this.state.sessionId);
        delete this.state.pendingApproval;
        this.hideApprovalModal();
        break;
      case "verbose":
        this.state.verbose = !this.state.verbose;
        this.state.toast = `Verbose mode ${this.state.verbose ? "enabled" : "disabled"}.`;
        break;
      case "abort":
        if (this.activeTurnAbortController) {
          this.activeTurnAbortController.abort(new Error("Aborted by user."));
          this.state.toast = "Abort requested.";
        } else {
          this.state.toast = "No active turn to abort.";
        }
        break;
      case "model":
        if (rest.length === 0) {
          this.state.toast = "Usage: /model <name>";
        } else {
          this.state.model = rest.join(" ");
          this.state.toast = `Model set to ${this.state.model}.`;
        }
        break;
      default:
        this.state.toast = `Unknown command: /${command ?? ""}`;
        this.openOverlay("help");
        break;
    }
    this.render();
  }

  private async runTurn(text: string): Promise<void> {
    this.followOutput = true;
    addConversation(this.state, "user", text);
    this.state.status = "running";
    this.state.toast = "Running. Waiting for model or tools...";
    this.render();
    this.startHeartbeat();

    this.activeTurnAbortController = new AbortController();
    this.activeTurnPromise = this.executeTurn(text, this.activeTurnAbortController.signal)
      .catch((error: unknown) => {
        this.state.status = "failed";
        this.state.toast = error instanceof Error ? error.message : String(error);
        addConversation(this.state, "system", this.state.toast);
      })
      .finally(() => {
        this.stopHeartbeat();
        this.activeTurnAbortController = undefined;
        this.activeTurnPromise = undefined;
        this.render();
      });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.activeTurnHeartbeat = setInterval(() => {
      if (!this.activeTurnPromise) {
        return;
      }
      this.state.clock = new Date().toLocaleTimeString("en-GB", { hour12: false });
      this.render();
    }, 1000);
  }

  private stopHeartbeat(): void {
    if (this.activeTurnHeartbeat) {
      clearInterval(this.activeTurnHeartbeat);
      this.activeTurnHeartbeat = undefined;
    }
  }

  private async executeTurn(text: string, abortSignal: AbortSignal): Promise<void> {
    const config = loadConfigForModel(this.state.model);
    const provider = createModelProvider(config, this.state.model);
    const task = applyRecommendedMaxSteps(
      {
        id: createId("task"),
        text,
        cwd: this.state.cwd,
        mode: this.state.mode,
        maxSteps: this.options.maxSteps,
        metadata: {
          createdAt: nowIso(),
          source: "tui",
        },
        requestedModel: this.state.model,
      },
      this.state.cwd,
    );
    const profile = createDefaultProfile(this.state.model ?? provider.name, {
      repoRootFocus: isBroadRepoRootTask(task, this.state.cwd),
    });
    const { loop } = await createCliAgentLoop(this.state.cwd, provider, profile, {
      permissionPrompter: {
        approve: (sessionId, toolCall, decision, approvalOptions) =>
          this.approvalManager.request(sessionId, toolCall, decision.reason, {
            ...(approvalOptions?.onPending === undefined
              ? {}
              : { onPending: approvalOptions.onPending }),
          }),
      },
    });
    const session = await runAgentSession({
      task,
      profile,
      model: provider,
      loop,
      workspaceRoot: this.state.cwd,
      abortSignal,
      onStatusChange: (status) => {
        this.state.status = status;
        this.render();
      },
      onEvent: async (event) => {
        this.handleEvent(event);
      },
      ...(this.state.sessionId === undefined ? {} : { resumeSessionId: this.state.sessionId }),
      ...(this.state.mode === "ask" ? {} : { approvePlan: (request) => this.requestPlanApproval(task, request.planText) }),
    });
    this.handleResult(task, session.result);
  }

  private handleEvent(event: AgentEvent): void {
    applyTuiEvent(this.state, event);
    if (event.kind === "approval.requested") {
      this.showApprovalModal();
    }
    this.render();
  }

  private handleResult(_task: UserTask, result: AgentResult): void {
    this.state.sessionId = result.sessionId;
    this.state.status = getEffectiveResultStatus(result);
    this.state.step = result.steps;
    const body = formatFinalText(result.summary ?? result.finalText, { level: 1 }).trim();
    if (body.length > 0) {
      addConversation(this.state, "assistant", body);
    }
    this.state.toast = `${this.state.status} · ${result.steps} steps · ${result.modelName}`;
    this.render();
  }

  private requestPlanApproval(task: UserTask, planText: string): Promise<boolean> {
    const { plan } = buildRuntimePlan(task, planText);
    setAgentPlan(this.state, plan);
    this.state.pendingPlanText = planText;
    this.state.status = "awaiting_approval";
    this.state.toast = "Plan approval required. Type y/a/n in INPUT and press Enter.";
    this.showApprovalModal();
    return new Promise((resolvePlan) => {
      this.pendingPlan = {
        text: planText,
        resolve: (approved) => {
          delete this.state.pendingPlanText;
          this.pendingPlan = undefined;
          this.state.status = "running";
          this.state.toast = approved ? "Plan approved." : "Plan denied.";
          this.hideApprovalModal();
          resolvePlan(approved);
        },
      };
    });
  }

  private resolvePlan(approved: boolean): void {
    this.pendingPlan?.resolve(approved);
  }

  private async resolveApproval(approved: boolean, always: boolean): Promise<void> {
    if (this.pendingPlan) {
      this.resolvePlan(approved);
      return;
    }
    if (!this.state.pendingApproval) {
      return;
    }
    const approval = this.state.pendingApproval;
    const result = always
      ? await this.approvalManager.approveAlways(this.state.pendingApproval.id, this.state.sessionId)
      : approved
        ? await this.approvalManager.approve(this.state.pendingApproval.id, this.state.sessionId)
        : await this.approvalManager.deny(this.state.pendingApproval.id, this.state.sessionId);
    this.state.toast =
      result === "No matching pending approval." && !this.activeTurnPromise
        ? `${approved ? "Approved" : "Denied"} ${approval.id} in preview.`
        : result;
    delete this.state.pendingApproval;
    this.hideApprovalModal();
  }

  private buildOverlayContext(): TuiOverlayContext {
    const overlayContext: TuiOverlayContext = {};
    const pendingPlanText = this.state.pendingPlanText ?? this.pendingPlan?.text;
    if (pendingPlanText) {
      overlayContext.pendingPlanText = pendingPlanText;
    }
    if (this.state.pendingApproval) {
      overlayContext.pendingApproval = this.state.pendingApproval;
    }
    return overlayContext;
  }

  private render(): void {
    this.applyResponsiveLayout();
    this.status.setContent(` ${renderTuiStatusLine(this.state)}`);
    this.main.setContent(renderTuiMainContent(this.state, Math.max(42, Number(this.screen.width) - 3)));
    this.toast.setContent(renderFixedToast(this.state, this.followOutput));
    this.inputPrompt.setContent(
      inputPromptText(this.state, this.state.pendingPlanText ?? this.pendingPlan?.text),
    );
    this.renderCompletions();

    const overlayContext = this.buildOverlayContext();
    const approvalVisible = isApprovalActive(
      this.state,
      this.state.pendingPlanText ?? this.pendingPlan?.text,
    );

    if (approvalVisible) {
      this.backdrop.show();
      this.approvalModal.show();
      this.approvalModal.setLabel(" Approval required ");
      this.approvalModal.setContent(renderApprovalModal(this.state, overlayContext));
      this.overlay.hide();
    } else {
      this.approvalModal.hide();
      this.backdrop.hide();
      const panel = this.state.overlay;
      if (panel) {
        this.backdrop.show();
        this.overlay.show();
        this.overlay.setLabel(overlayTitle(panel, this.state));
        this.overlay.style.border = { fg: overlayBorderColor(panel) };
        this.overlay.setContent(renderTuiOverlay(this.state, overlayContext));
      } else {
        this.overlay.hide();
        this.backdrop.hide();
      }
    }

    if (this.followOutput && !this.state.overlay && !approvalVisible) {
      (this.main as ScrollableBox).setScrollPerc(100);
    }
    this.screen.render();
  }

  private applyResponsiveLayout(): void {
    const compact = Number(this.screen.height) < 20;
    this.main.bottom = compact ? 4 : 5;
    this.toast.hidden = compact;
    this.completion.bottom = compact ? 4 : 5;
    this.completion.height = compact ? 5 : 8;
    this.overlay.width = compact ? "100%" : "88%";
    this.overlay.height = compact ? "100%" : "62%";
    this.approvalModal.width = compact ? "100%" : "72%";
    this.approvalModal.height = compact ? "100%" : "48%";
  }

  private renderCompletions(): void {
    const current = this.input.getValue().trim();
    const content = renderSlashCommandCompletions(this.completionSeed ?? current, this.tabCompletionIndex);
    if (content.length === 0) {
      this.completion.hide();
      return;
    }
    this.completion.setLabel(" Slash commands ");
    this.completion.setContent(`${content}\n{gray-fg}Tab cycles · Enter runs · Esc closes panels{/gray-fg}`);
    this.completion.show();
  }

  private shutdown(code: number): void {
    this.exitCode = code;
    this.screen.destroy();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
