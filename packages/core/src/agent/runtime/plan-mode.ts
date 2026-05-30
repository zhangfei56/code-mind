import { relative, resolve } from "node:path";
import type {
  AgentMode,
  AgentSession,
  RuntimeInput,
  ToolCall,
  ToolResult,
  ToolSchema,
} from "@code-mind/shared";
import { nowIso } from "@code-mind/shared";
import type { ToolRegistry } from "@code-mind/execution";
import { getSessionDir } from "@code-mind/workspace";
import type { SessionStorePort } from "./ports/session-store-port.js";
import { buildRuntimePlan } from "./plan-artifact.js";
import type { RunState } from "./run-state.js";
import type { SessionLifecycleDeps } from "./session-lifecycle.js";
import {
  modeChangedEvent,
  planEnteredEvent,
  planExitedEvent,
} from "./agent-events.js";

const PLAN_MODE_COLLABORATION_MODES = new Set<AgentMode>(["edit", "agent"]);

function dedupeToolSchemas(schemas: ToolSchema[]): ToolSchema[] {
  const seen = new Set<string>();
  const unique: ToolSchema[] = [];
  for (const schema of schemas) {
    if (seen.has(schema.name)) {
      continue;
    }
    seen.add(schema.name);
    unique.push(schema);
  }
  return unique;
}

function appendToolSchemaIfMissing(schemas: ToolSchema[], schema: ToolSchema): void {
  if (!schemas.some((item) => item.name === schema.name)) {
    schemas.push(schema);
  }
}

export function resolvePlanDraftRelativePath(
  workspaceRoot: string,
  sessionId: string,
): string {
  const absolute = resolve(getSessionDir(workspaceRoot, sessionId), "plan-draft.md");
  return relative(workspaceRoot, absolute);
}

export function isPlanDraftPath(
  workspaceRoot: string,
  sessionId: string,
  candidatePath: string,
): boolean {
  const draftRelative = resolvePlanDraftRelativePath(workspaceRoot, sessionId);
  const normalized = candidatePath.replace(/\\/g, "/");
  const draftNormalized = draftRelative.replace(/\\/g, "/");
  return (
    normalized === draftNormalized ||
    normalized.endsWith(`/${draftNormalized}`) ||
    normalized.endsWith("/plan-draft.md")
  );
}

export function getPermissionMode(runState: RunState): AgentMode {
  if (runState.planMode.active) {
    return "plan";
  }
  return runState.progress.mode;
}

export function canEnterCollaborationPlanMode(
  runState: RunState,
  session: AgentSession,
): boolean {
  if (runState.planMode.active) {
    return false;
  }
  if (session.task.mode === "plan" || session.task.mode === "ask") {
    return false;
  }
  if (session.metadata?.subagent === true) {
    return false;
  }
  return PLAN_MODE_COLLABORATION_MODES.has(runState.progress.mode);
}

export function getCollaborationToolSchemas(
  registry: ToolRegistry,
  runState: RunState,
): ToolSchema[] {
  const baseMode = runState.planMode.active ? "plan" : runState.progress.mode;
  const schemas = registry.getSchemasForMode(baseMode);
  if (
    !runState.planMode.active &&
    PLAN_MODE_COLLABORATION_MODES.has(runState.progress.mode)
  ) {
    const enter = registry.get("enter_plan_mode");
    if (enter) {
      appendToolSchemaIfMissing(schemas, enter.schema);
    }
  }
  if (runState.planMode.active) {
    const patch = registry.get("apply_patch");
    if (patch) {
      appendToolSchemaIfMissing(schemas, patch.schema);
    }
    const subagent = registry.get("run_subagent");
    if (subagent) {
      appendToolSchemaIfMissing(schemas, subagent.schema);
    }
    const exit = registry.get("exit_plan_mode");
    if (exit) {
      appendToolSchemaIfMissing(schemas, exit.schema);
    }
  }
  return dedupeToolSchemas(schemas);
}


export async function handleEnterPlanMode(
  deps: {
    lifecycle: SessionLifecycleDeps;
    sessionStore: SessionStorePort;
  },
  params: {
    session: AgentSession;
    input: RuntimeInput;
    runState: RunState;
  },
): Promise<ToolResult> {
  const { session, input, runState } = params;
  if (!canEnterCollaborationPlanMode(runState, session)) {
    return {
      success: false,
      output: "",
      error: "Plan mode cannot be entered in the current session state.",
    };
  }

  const preMode = runState.progress.mode;
  const draftRelativePath = resolvePlanDraftRelativePath(
    session.workspaceRoot,
    session.id,
  );
  runState.planMode = {
    active: true,
    preMode,
    draftRelativePath,
  };
  session.metadata = {
    ...session.metadata,
    planModeActive: true,
    planDraftPath: draftRelativePath,
  };

  await deps.lifecycle.publish(input, planEnteredEvent(preMode, draftRelativePath));
  await deps.lifecycle.publish(
    input,
    modeChangedEvent(preMode, "plan", "enter_plan"),
  );

  return {
    success: true,
    output: [
      "Entered plan mode.",
      `Write the plan only to: ${draftRelativePath}`,
      "Explore the codebase with read-only tools, then call exit_plan_mode with the final plan text.",
    ].join("\n"),
    metadata: { draftPath: draftRelativePath, preMode },
  };
}

export async function handleExitPlanMode(
  deps: {
    lifecycle: SessionLifecycleDeps;
    sessionStore: SessionStorePort;
  },
  params: {
    session: AgentSession;
    input: RuntimeInput;
    runState: RunState;
    toolCall: ToolCall;
    planText: string;
  },
): Promise<ToolResult> {
  const { session, input, runState, planText } = params;
  if (!runState.planMode.active || !runState.planMode.preMode) {
    return {
      success: false,
      output: "",
      error: "Plan mode is not active.",
    };
  }

  const trimmed = planText.trim();
  if (!trimmed) {
    return {
      success: false,
      output: "",
      error: "exit_plan_mode requires non-empty planText.",
    };
  }

  const preMode = runState.planMode.preMode;
  const autoApprove = input.autoApprovePlan === true;
  const approved = input.approvePlan
    ? await input.approvePlan({
        planSessionId: session.id,
        planText: trimmed,
      })
    : autoApprove;

  if (!approved) {
    return {
      success: false,
      output: "",
      error: "Plan was not approved. Revise the plan or retry after user approval.",
      metadata: { rejectionKind: "user_rejected" },
    };
  }

  const { plan, markdown } = buildRuntimePlan(session.task, trimmed);
  await deps.sessionStore.savePlan(session.id, plan, markdown);
  if (runState.planMode.draftRelativePath) {
    await deps.sessionStore.writeSessionTextFile(
      session.id,
      "plan-draft.md",
      `${markdown}\n`,
    );
  }

  runState.planMode = {
    active: false,
    preMode,
    approved: true,
    ...(runState.planMode.draftRelativePath === undefined
      ? {}
      : { draftRelativePath: runState.planMode.draftRelativePath }),
  };
  runState.progress.mode = preMode;
  session.task = { ...session.task, mode: preMode };
  session.metadata = {
    ...session.metadata,
    planModeActive: false,
    planApprovedAt: nowIso(),
  };

  await deps.lifecycle.publish(
    input,
    planExitedEvent({
      approved: true,
      preMode,
      ...(runState.planMode.draftRelativePath === undefined
        ? {}
        : { planPath: runState.planMode.draftRelativePath }),
    }),
  );
  await deps.lifecycle.publish(
    input,
    modeChangedEvent("plan", preMode, "exit_plan"),
  );

  return {
    success: true,
    output: [
      "Plan approved.",
      "You have exited plan mode and may now modify source files according to the approved plan.",
      "",
      trimmed,
    ].join("\n"),
    metadata: { preMode, approved: true },
  };
}

export function isPlanModeTool(toolName: string): boolean {
  return toolName === "enter_plan_mode" || toolName === "exit_plan_mode";
}

export function readPlanTextArg(toolCall: ToolCall): string {
  const value = toolCall.arguments.planText;
  return typeof value === "string" ? value : "";
}
