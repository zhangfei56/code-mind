import type { ApprovalRecord } from "@code-mind/shared";
import { renderInteractivePermissions } from "../interactive/session-views.js";
import { formatTokenUsageSummary } from "../ui/format.js";
import {
  renderTuiContextPanel,
  renderTuiDiffPanel,
  renderTuiStatusDetails,
} from "./context.js";
import type { TuiOverlayPanel, TuiState } from "./state.js";
import {
  statusLine,
  truncate,
  tuiPlanSteps,
  visibleActivityRows,
} from "./state.js";

const DEFAULT_MAIN_WIDTH = 96;

export function selectableRowCount(state: TuiState): number {
  return visibleActivityRows(state).length + 1;
}

function thinkingLine(state: TuiState): string {
  const phase = state.thinkingPhase ? ` · ${state.thinkingPhase}` : "";
  const focus = truncate(state.thinkingFocus, state.verbose ? 56 : 42);
  return state.isThinking
    ? `{yellow-fg}… thinking${phase}{/yellow-fg}`
    : `{gray-fg}… thinking${phase}{/gray-fg}`;
}

export function renderTuiMainContent(state: TuiState, width = DEFAULT_MAIN_WIDTH): string {
  const lines: string[] = [];
  const contentWidth = Math.max(42, width - 4);

  for (const entry of state.conversation) {
    const color =
      entry.role === "user"
        ? "blue"
        : entry.role === "assistant"
          ? "magenta"
          : "gray";
    const title = entry.role === "assistant" && entry.text.length > 160 ? "Final" : entry.role;
    lines.push(`{${color}-fg}${title}{/${color}-fg}`);
    lines.push(...wrapBlock(entry.text, contentWidth).map((line) => `  ${line}`));
    lines.push("");
  }

  const plan = tuiPlanSteps(state);
  if (plan.length > 0) {
    lines.push("{cyan-fg}Plan{/cyan-fg}");
    for (const step of plan) {
      const glyph =
        step.status === "done"
          ? "{green-fg}✓{/green-fg}"
          : step.status === "current"
            ? "{yellow-fg}→{/yellow-fg}"
            : "{gray-fg}·{/gray-fg}";
      lines.push(`  ${glyph} ${step.index}. ${truncate(step.label, Math.min(72, contentWidth - 8))}`);
    }
    lines.push("");
  }

  lines.push("{cyan-fg}Activity{/cyan-fg}");
  const rows = visibleActivityRows(state);
  rows.forEach((row, index) => {
    const selected = index === state.selectedRow ? "{yellow-fg}>{/yellow-fg}" : " ";
    const glyph =
      row.glyph === "✓"
        ? "{green-fg}✓{/green-fg}"
        : row.glyph === "×"
          ? "{red-fg}×{/red-fg}"
          : "{gray-fg}·{/gray-fg}";
    const targetWidth = Math.max(18, Math.min(42, contentWidth - 35));
    lines.push(`${selected} ${glyph} ${truncate(row.tool, 14).padEnd(15)} ${truncate(row.target, targetWidth).padEnd(targetWidth + 1)} {gray-fg}${row.meta}{/gray-fg}`);
    if (state.verbose && row.outputPreview) {
      lines.push(...wrapBlock(truncate(row.outputPreview, 600), contentWidth - 4).map((line) => `    {gray-fg}${line}{/gray-fg}`));
    }
  });

  const thinkingIndex = rows.length;
  const thinkingSelected = state.selectedRow === thinkingIndex ? "{yellow-fg}>{/yellow-fg}" : " ";
  lines.push(
    `${thinkingSelected} ${thinkingLine(state)}  ${truncate(state.thinkingFocus, Math.min(60, contentWidth - 36))} {gray-fg}[enter expand]{/gray-fg}`,
  );

  if (state.hiddenActivityCount > 0) {
    lines.push(`  {gray-fg}… ${state.hiddenActivityCount} more events ›{/gray-fg}`);
  }

  if (state.lastError && !state.overlay) {
    lines.push("");
    lines.push(`{red-fg}✕ ${state.lastError.title}{/red-fg}  {gray-fg}${truncate(state.lastError.detail, Math.min(70, contentWidth - 16))}{/gray-fg}`);
  }

  lines.push("");
  lines.push(
    "{gray-fg}Hints:{/gray-fg} {cyan-fg}/status{/cyan-fg}  {cyan-fg}/context{/cyan-fg}  {cyan-fg}/diff{/cyan-fg}  {cyan-fg}/reason{/cyan-fg}  {cyan-fg}/permissions{/cyan-fg}  {cyan-fg}/verbose{/cyan-fg}  {cyan-fg}/help{/cyan-fg}",
  );

  return lines.join("\n");
}

export interface TuiOverlayContext {
  pendingPlanText?: string;
  pendingApproval?: ApprovalRecord;
}

export function overlayTitle(panel: TuiOverlayPanel, state?: TuiState): string {
  switch (panel) {
    case "reason":
      return state?.step ? ` Reasoning Summary · step ${state.step} ` : " Reasoning Summary ";
    case "evidence":
      return " Diff ";
    case "approval":
      return " Approval required ";
    case "permissions":
      return " Permissions ";
    case "help":
      return " Help ";
    case "status":
      return " Status ";
    case "context":
      return " Context ";
    case "events":
      return " Runtime Events ";
    case "error":
      return state?.lastError?.title ? ` ${state.lastError.title} ` : " Error ";
    case "thinking":
    default:
      return " Thinking ";
  }
}

export function overlayBorderColor(panel: TuiOverlayPanel): string {
  switch (panel) {
    case "reason":
      return "magenta";
    case "evidence":
      return "blue";
    case "approval":
      return "yellow";
    case "permissions":
      return "cyan";
    case "status":
      return "green";
    case "context":
      return "cyan";
    case "events":
      return "cyan";
    case "error":
      return "red";
    default:
      return "yellow";
  }
}

export function renderTuiOverlay(state: TuiState, ctx: TuiOverlayContext = {}): string {
  const panel = state.overlay;
  if (!panel) {
    return "";
  }

  switch (panel) {
    case "reason":
      return renderReasonOverlay(state);
    case "evidence":
      return renderTuiDiffPanel(state.diffSummary, state.evidenceText);
    case "permissions":
      return renderInteractivePermissions(state.mode);
    case "help":
      return renderHelpOverlay(state);
    case "events":
      return renderEventsOverlay(state);
    case "status": {
      const taskText = state.conversation.find((entry) => entry.role === "user")?.text;
      return renderTuiStatusDetails({
        cwd: state.cwd,
        mode: state.mode,
        model: state.model,
        ...(state.gitSummary === undefined ? {} : { gitSummary: state.gitSummary }),
        step: state.step,
        maxSteps: state.maxSteps,
        ...(state.sessionId === undefined ? {} : { sessionId: state.sessionId }),
        status: state.status,
        ...(taskText === undefined ? {} : { taskText }),
        filesRead: state.filesRead.length,
        filesChanged: state.filesChanged.length,
        commandsRun: state.commandsRun,
      });
    }
    case "context":
      return renderTuiContextPanel({
        filesRead: state.filesRead,
        filesChanged: state.filesChanged,
        commandsRun: state.commandsRun,
        compactionCount: state.compactionCount,
        ...(state.tokenUsage === undefined ? {} : { tokenUsage: state.tokenUsage }),
        activityDetail: state.activityDetail,
        step: state.step,
        maxSteps: state.maxSteps,
        ...(state.sessionId === undefined ? {} : { sessionId: state.sessionId }),
        ...(state.agentPlan === undefined ? {} : { agentPlan: state.agentPlan }),
      });
    case "approval":
      return renderApprovalOverlay(state, ctx);
    case "error":
      return renderErrorOverlay(state);
    case "thinking":
    default:
      return renderThinkingOverlay(state);
  }
}

export function renderApprovalModal(state: TuiState, ctx: TuiOverlayContext = {}): string {
  const planText = ctx.pendingPlanText ?? state.pendingPlanText;
  if (planText) {
    const lines = [
      "{yellow-fg}{bold}Plan approval required{/bold}{/yellow-fg}",
      "",
    ];
    if (state.agentPlan) {
      lines.push(
        `{cyan-fg}Summary{/cyan-fg}  ${state.agentPlan.summary}`,
        `{cyan-fg}Risk{/cyan-fg}     ${state.agentPlan.riskLevel}`,
        `{cyan-fg}Steps{/cyan-fg}    ${state.agentPlan.steps.length}`,
        "",
      );
      for (const step of state.agentPlan.steps.slice(0, 6)) {
        lines.push(`  · ${truncate(step.title || step.description, 64)}`);
      }
      lines.push("");
    }
    lines.push(...wrapBlock(truncate(planText, 1200), 84));
    lines.push(
      "",
      "{yellow-fg}Options{/yellow-fg}",
      "  Type y / a / n in the yellow INPUT box, then press Enter.",
      "  y allow once   a always allow   n deny",
    );
    return lines.join("\n");
  }

  const approval = ctx.pendingApproval ?? state.pendingApproval;
  if (!approval) {
    return [
      "{yellow-fg}{bold}Approvals{/bold}{/yellow-fg}",
      "",
      "No pending approval.",
    ].join("\n");
  }

  const args = (approval.metadata?.arguments ?? {}) as Record<string, unknown>;
  const command =
    typeof args.command === "string"
      ? args.command
      : typeof args.path === "string"
        ? args.path
        : approval.toolName;
  const diff =
    typeof approval.metadata?.diffPreview === "string" ? approval.metadata.diffPreview : "";

  return [
    "{yellow-fg}{bold}Approval required{/bold}{/yellow-fg}",
    "",
    "Agent wants to run",
    ...wrapBlock(command, 84).map((line) => `  ${line}`),
    "",
    "Purpose",
    ...wrapBlock(approval.reason, 84).map((line) => `  ${line}`),
    "",
    "Risk",
    "  - May modify workspace files or run external commands.",
    "  - Review arguments and side effects before allowing.",
    ...(diff
      ? ["", "{yellow-fg}Diff preview{/yellow-fg}", ...wrapBlock(truncate(diff, 700), 84)]
      : []),
    "",
    "{yellow-fg}Options{/yellow-fg}",
    "  y allow once   a always allow this kind   n deny   e explain",
    "  You can also type the choice in the yellow INPUT box.",
  ].join("\n");
}

function renderThinkingOverlay(state: TuiState): string {
  return [
    "{yellow-fg}{bold}Thinking{/bold}{/yellow-fg}",
    "",
    "{yellow-fg}Current focus{/yellow-fg}",
    `  ${state.thinkingFocus || "Waiting for model activity."}`,
    "",
    "{yellow-fg}Hypothesis{/yellow-fg}",
    `  ${state.hypothesis || state.reasoningPreview || "(not recorded yet)"}`,
    "",
    "{yellow-fg}Next action{/yellow-fg}",
    `  ${state.nextAction}`,
    "",
    "{gray-fg}r reason summary   e evidence   q close{/gray-fg}",
  ].join("\n");
}

function renderReasonOverlay(state: TuiState): string {
  const evidenceLines = [
    ...state.filesRead.slice(-4).map((file) => `  - read ${file}`),
    ...visibleActivityRows(state).map(
      (row) => `  - ${row.tool} ${row.target} ${row.meta}`.trimEnd(),
    ),
  ];
  return [
    "{magenta-fg}{bold}Reasoning Summary{/bold}{/magenta-fg}",
    "",
    "{magenta-fg}Hypothesis{/magenta-fg}",
    `  ${state.hypothesis || state.reasoningPreview || state.thinkingFocus || "No reasoning summary yet."}`,
    "",
    "{magenta-fg}Evidence{/magenta-fg}",
    ...(evidenceLines.length > 0 ? evidenceLines : ["  (none yet)"]),
    "",
    "{magenta-fg}Decision{/magenta-fg}",
    `  ${state.nextAction}`,
    "",
    "{magenta-fg}Alternative considered{/magenta-fg}",
    `  ${state.alternativeConsidered || "(not recorded yet)"}`,
    "",
    ...(state.verbose && state.lastModelDurationMs
      ? [`{gray-fg}Model latency ${state.lastModelDurationMs}ms${state.lastContextTokens ? ` · ctx ${state.lastContextTokens}` : ""}{/gray-fg}`, ""]
      : []),
    "{gray-fg}q close   e evidence   d diff{/gray-fg}",
  ].join("\n");
}

function renderErrorOverlay(state: TuiState): string {
  const card = state.lastError;
  if (!card) {
    return "No recent error.";
  }
  return [
    `{red-fg}{bold}${card.title}{/bold}{/red-fg}`,
    "",
    card.detail,
    "",
    "{yellow-fg}Hint{/yellow-fg}",
    `  ${card.hint}`,
    "",
    "{gray-fg}q close   /expand output{/gray-fg}",
  ].join("\n");
}

function renderHelpOverlay(state: TuiState): string {
  const tokenLine = state.tokenUsage
    ? `Tokens last turn: ${formatTokenUsageSummary(state.tokenUsage)}`
    : "Tokens: n/a";
  const contextual = state.pendingApproval || state.pendingPlanText
    ? ["y approve once", "a approve always", "n deny", "e explain approval"]
    : state.status === "running"
      ? ["/abort interrupt active turn", "/reason reasoning summary", "/diff latest evidence"]
      : ["Type a task", "Tab completes slash commands", "Enter opens selected detail"];
  return [
    "{cyan-fg}{bold}Commands{/bold}{/cyan-fg}",
    "",
    "/status        current session status",
    "/context       context, files, tokens",
    "/reason        reasoning summary",
    "/diff          latest evidence/diff",
    "/events        raw recent runtime events",
    "/expand        expand recent events",
    "/permissions   active permission policy",
    "/approvals     pending approvals",
    `/verbose       toggle verbose mode (${state.verbose ? "on" : "off"})`,
    "/abort         interrupt active turn",
    "/model <name>  switch model for next turn",
    "/exit          leave TUI",
    "",
    tokenLine,
    "",
    "{cyan-fg}Now{/cyan-fg}",
    ...contextual.map((line) => `  ${line}`),
    "",
    "Keys: ↑/↓ select · PgUp/PgDn scroll · Home/End top/bottom · Tab complete · Ctrl+L clear · Ctrl+C interrupt",
    "History: Ctrl+P previous input · Ctrl+N next input",
    "Input: the yellow INPUT box is the only editable area.",
  ].join("\n");
}

function renderEventsOverlay(state: TuiState): string {
  return [
    "{cyan-fg}{bold}Runtime Events{/bold}{/cyan-fg}",
    "",
    ...(state.recentEvents.length > 0 ? state.recentEvents : ["No events recorded yet."]),
    "",
    "{gray-fg}q close · PgUp/PgDn scroll{/gray-fg}",
  ].join("\n");
}

function renderApprovalOverlay(state: TuiState, ctx: TuiOverlayContext): string {
  return renderApprovalModal(state, ctx);
}

export function renderTuiStatusLine(state: TuiState): string {
  return statusLine(state);
}

export function resolveOverlayForSelection(state: TuiState): TuiOverlayPanel {
  const rows = visibleActivityRows(state).length;
  if (state.selectedRow >= rows) {
    return "thinking";
  }
  const row = visibleActivityRows(state)[state.selectedRow];
  if (row?.glyph === "×") {
    return state.lastError ? "error" : "evidence";
  }
  return "evidence";
}

export function isApprovalActive(state: TuiState, pendingPlanText?: string): boolean {
  return Boolean(state.pendingApproval || state.pendingPlanText || pendingPlanText);
}

export function inputPromptText(state: TuiState, pendingPlanText?: string): string {
  if (isApprovalActive(state, pendingPlanText)) {
    return "{yellow-fg}approval required › type y / a / n in INPUT and press Enter{/yellow-fg}";
  }
  if (state.verbose) {
    return "{gray-fg}› verbose{/gray-fg} Type a task or /command in the yellow INPUT box...";
  }
  return "{gray-fg}›{/gray-fg} Type a task or /command in the yellow INPUT box...";
}

export function renderFixedToast(state: TuiState, followOutput = true): string {
  const history = followOutput ? "" : " {yellow-fg}Viewing history · End to follow{/yellow-fg}";
  const status = state.toast && state.toast !== "Ready." ? truncate(state.toast, 90) : "Ready.";
  return `{gray-fg}${status}{/gray-fg}${history}`;
}

function wrapBlock(text: string, width: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  return lines.flatMap((line) => wrapLine(line, width));
}

function wrapLine(line: string, width: number): string[] {
  if (line.length <= width) {
    return [line];
  }
  const out: string[] = [];
  let rest = line;
  while (rest.length > width) {
    let cut = rest.lastIndexOf(" ", width);
    if (cut < Math.floor(width * 0.5)) {
      cut = width;
    }
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  out.push(rest);
  return out;
}
