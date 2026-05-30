import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createOrchestrationSessionStore } from "@code-mind/core";
import type { AgentMode } from "@code-mind/shared";
import { ValidationError } from "@code-mind/shared";
import { resolveWorkspace } from "@code-mind/workspace";
import type { RunCliArgs } from "../cli/parse-args.js";
import { forkSession, listContinuableSessionId } from "./sessions.js";

export interface ResolvedRunContext {
  taskText: string;
  cwd: string;
  workspaceRoot: string;
  sessionRoot: string;
  mode: AgentMode;
  modeExplicit: boolean;
  maxSteps: number;
  model?: string;
  resumeSessionId?: string;
}

export async function resolveRunContext(args: RunCliArgs): Promise<ResolvedRunContext> {
  const cwd = args.cwd;
  const workspaceRoot = resolveWorkspace(resolve(cwd));

  let taskText = args.task.trim();
  if (args.promptFile) {
    taskText = (await readFile(resolve(args.promptFile), "utf8")).trim();
  }

  let resumeSessionId = args.sessionId;
  if (args.continue && !resumeSessionId) {
    resumeSessionId = await listContinuableSessionId(workspaceRoot);
    if (!resumeSessionId) {
      throw new ValidationError("No session to continue. Start a new run first.");
    }
  }

  if (args.fork) {
    if (!resumeSessionId) {
      throw new ValidationError("--fork requires --continue or --session <id>.");
    }
    resumeSessionId = await forkSession(workspaceRoot, resumeSessionId);
  }

  let sessionRoot = workspaceRoot;
  let mode = args.mode;
  let modeExplicit = args.modeExplicit;
  let maxSteps = args.maxSteps;
  let model = args.model;

  if (resumeSessionId) {
    const store = createOrchestrationSessionStore(workspaceRoot);
    const manifest = await store.readManifest(resumeSessionId);
    sessionRoot = manifest.projectPath;
    if (!modeExplicit) {
      mode = manifest.mode;
    }
    if (model === undefined) {
      model = manifest.model;
    }
    if (!args.modeExplicit && manifest.maxSteps !== undefined) {
      maxSteps = manifest.maxSteps;
    }
  }

  if (!taskText) {
    if (resumeSessionId) {
      taskText = "Continue.";
    } else {
      throw new ValidationError("Missing task. Provide a prompt or use --file / -f.");
    }
  }

  return {
    taskText,
    cwd,
    workspaceRoot,
    sessionRoot,
    mode,
    modeExplicit,
    maxSteps,
    ...(model === undefined ? {} : { model }),
    ...(resumeSessionId === undefined ? {} : { resumeSessionId }),
  };
}
