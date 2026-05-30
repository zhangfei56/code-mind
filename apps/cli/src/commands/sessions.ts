import { readFile, writeFile, rm, mkdir, cp } from "node:fs/promises";
import { join } from "node:path";
import { createOrchestrationSessionStore } from "@code-mind/core";
import { revertSession } from "@code-mind/session";
import { createId, nowIso, type SessionManifest } from "@code-mind/shared";
import { getAgentSessionsRoot } from "@code-mind/workspace";

export interface SessionExportBundle {
  version: 1;
  exportedAt: string;
  workspaceRoot: string;
  manifest: SessionManifest;
  currentSummary?: string;
  summary?: string;
  plan?: { plan: unknown; markdown: string };
}

function sessionStore(workspaceRoot: string) {
  return createOrchestrationSessionStore(workspaceRoot);
}

export async function exportSession(
  workspaceRoot: string,
  sessionId: string,
): Promise<SessionExportBundle> {
  const store = sessionStore(workspaceRoot);
  const manifest = await store.readManifest(sessionId);
  const sessionDir = store.getSessionDir(sessionId);

  const readOptional = async (fileName: string): Promise<string | undefined> => {
    try {
      return await readFile(join(sessionDir, fileName), "utf8");
    } catch {
      return undefined;
    }
  };

  const plan = await store.readPlan(sessionId);

  return {
    version: 1,
    exportedAt: nowIso(),
    workspaceRoot,
    manifest,
    ...(await readOptional("current-summary.md")
      .then((value) => (value ? { currentSummary: value } : {}))),
    ...(await readOptional("summary.md").then((value) => (value ? { summary: value } : {}))),
    ...(plan ? { plan } : {}),
  };
}

export async function importSession(
  workspaceRoot: string,
  bundle: SessionExportBundle,
): Promise<string> {
  const store = sessionStore(workspaceRoot);
  const sessionId = createId("session");
  const timestamp = nowIso();
  const manifest: SessionManifest = {
    ...bundle.manifest,
    id: sessionId,
    projectPath: workspaceRoot,
    createdAt: timestamp,
    updatedAt: timestamp,
    status: bundle.manifest.status,
  };

  const sessionDir = store.getSessionDir(sessionId);
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    join(sessionDir, "session.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  if (bundle.currentSummary) {
    await writeFile(join(sessionDir, "current-summary.md"), bundle.currentSummary, "utf8");
  }
  if (bundle.summary) {
    await writeFile(join(sessionDir, "summary.md"), bundle.summary, "utf8");
  }
  if (bundle.plan) {
    await writeFile(
      join(sessionDir, "plan.json"),
      `${JSON.stringify(bundle.plan.plan, null, 2)}\n`,
      "utf8",
    );
    await writeFile(join(sessionDir, "plan.md"), bundle.plan.markdown, "utf8");
  }

  return sessionId;
}

export async function deleteSession(
  workspaceRoot: string,
  sessionId: string,
): Promise<void> {
  const store = sessionStore(workspaceRoot);
  await store.readManifest(sessionId);
  await rm(store.getSessionDir(sessionId), { recursive: true, force: true });
}

export async function renderSessionListJson(workspaceRoot: string): Promise<string> {
  const sessions = await sessionStore(workspaceRoot).listSessionManifests();
  return JSON.stringify(sessions, null, 2);
}

export async function listContinuableSessionId(
  workspaceRoot: string,
): Promise<string | undefined> {
  const sessions = await sessionStore(workspaceRoot).listSessionManifests();
  return sessions.find((session) => (session.sessionRole ?? "standard") !== "plan")?.id;
}

export async function forkSession(
  workspaceRoot: string,
  sourceSessionId: string,
): Promise<string> {
  const store = sessionStore(workspaceRoot);
  await store.readManifest(sourceSessionId);
  const newSessionId = createId("session");
  const sourceDir = store.getSessionDir(sourceSessionId);
  const targetDir = store.getSessionDir(newSessionId);
  await mkdir(join(getAgentSessionsRoot(workspaceRoot)), { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true });

  const sourceManifest = await store.readManifest(sourceSessionId);
  const timestamp = nowIso();
  const { executeSessionId: _executeSessionId, planSessionId: _planSessionId, ...base } =
    sourceManifest;
  const manifest: SessionManifest = {
    ...base,
    id: newSessionId,
    status: "idle",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await writeFile(
    join(targetDir, "session.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return newSessionId;
}

export async function listRecentSessionId(workspaceRoot: string): Promise<string | undefined> {
  return listContinuableSessionId(workspaceRoot);
}

export async function renderSessionList(workspaceRoot: string): Promise<string> {
  const sessions = await sessionStore(workspaceRoot).listSessionManifests();

  if (sessions.length === 0) {
    return "No sessions found.";
  }

  return sessions
    .map((session) => {
      const role = session.sessionRole ?? "standard";
      const link =
        session.executeSessionId !== undefined
          ? ` -> execute:${session.executeSessionId}`
          : session.planSessionId !== undefined
            ? ` <- plan:${session.planSessionId}`
            : "";
      return `${session.id}  ${session.status}  ${session.mode}  ${role}${link}  steps:${session.requestedMaxSteps ?? session.maxSteps ?? "?"}→${session.effectiveMaxSteps ?? session.maxSteps ?? "?"}  ${session.completion ?? "n/a"}  ${session.updatedAt}  ${session.task}`;
    })
    .join("\n");
}

export async function renderSessionShow(
  workspaceRoot: string,
  sessionId: string,
): Promise<string> {
  const store = sessionStore(workspaceRoot);
  const manifest = await store.readManifest(sessionId);
  const currentSummaryPath = join(store.getSessionDir(sessionId), "current-summary.md");

  let currentSummary = "";
  try {
    currentSummary = await readFile(currentSummaryPath, "utf8");
  } catch {
    currentSummary = "";
  }

  return [
    [
      `Session: ${manifest.id}`,
      `Status: ${manifest.status}`,
      `Mode: ${manifest.mode}`,
      `Role: ${manifest.sessionRole ?? "standard"}`,
      ...(manifest.executeSessionId
        ? [`Execute session: ${manifest.executeSessionId}`]
        : []),
      ...(manifest.planSessionId ? [`Plan session: ${manifest.planSessionId}`] : []),
      `Model: ${manifest.model}`,
      `Steps: requested=${manifest.requestedMaxSteps ?? manifest.maxSteps ?? "?"} base=${manifest.maxSteps ?? "?"} effective=${manifest.effectiveMaxSteps ?? "n/a"}`,
      `Completion: ${manifest.completion ?? "n/a"}`,
      `Updated: ${manifest.updatedAt}`,
      `Task: ${manifest.task}`,
    ].join("\n"),
    "",
    JSON.stringify(manifest, null, 2),
    currentSummary.trim().length > 0 ? currentSummary.trim() : "No current summary available.",
  ].join("\n\n");
}

export async function renderSessionRevert(
  workspaceRoot: string,
  sessionId: string,
): Promise<string> {
  const result = await revertSession(workspaceRoot, sessionId);
  if (result.skipped) {
    return `No snapshots found for session ${sessionId}. Nothing to revert.`;
  }
  return [
    `Reverted session ${result.sessionId}.`,
    `Files restored (${result.reverted.length}):`,
    ...result.reverted.map((path) => `  - ${path}`),
  ].join("\n");
}
