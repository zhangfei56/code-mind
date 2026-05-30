import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createId, nowIso } from "@code-mind/shared";
import type { RunAgentSessionResult } from "@code-mind/core";

export type AsyncRunStatus = "running" | "completed" | "failed" | "aborted";

export interface AsyncRunJob {
  id: string;
  status: AsyncRunStatus;
  startedAt: string;
  finishedAt?: string;
  sessionId?: string;
  result?: RunAgentSessionResult;
  error?: string;
}

export interface AsyncRunContext {
  runId: string;
  abortSignal: AbortSignal;
}

interface RunEntry {
  job: AsyncRunJob;
  abortController: AbortController;
}

interface PersistedAsyncRunJob extends AsyncRunJob {
  persistedAt: string;
}

function defaultRegistryDir(): string {
  return join(homedir(), ".code-mind", "async-runs");
}

async function ensureRegistryDir(registryDir: string): Promise<void> {
  await mkdir(registryDir, { recursive: true });
}

async function persistJob(registryDir: string, job: AsyncRunJob): Promise<void> {
  await ensureRegistryDir(registryDir);
  const payload: PersistedAsyncRunJob = {
    ...job,
    persistedAt: nowIso(),
  };
  await writeFile(join(registryDir, `${job.id}.json`), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function loadPersistedJobs(registryDir: string): Promise<AsyncRunJob[]> {
  if (!existsSync(registryDir)) {
    return [];
  }
  const files = (await readdir(registryDir)).filter((file) => file.endsWith(".json"));
  const jobs: AsyncRunJob[] = [];
  for (const file of files) {
    try {
      const raw = await readFile(join(registryDir, file), "utf8");
      const parsed = JSON.parse(raw) as PersistedAsyncRunJob;
      jobs.push({
        id: parsed.id,
        status: parsed.status,
        startedAt: parsed.startedAt,
        ...(parsed.finishedAt === undefined ? {} : { finishedAt: parsed.finishedAt }),
        ...(parsed.sessionId === undefined ? {} : { sessionId: parsed.sessionId }),
        ...(parsed.result === undefined ? {} : { result: parsed.result }),
        ...(parsed.error === undefined ? {} : { error: parsed.error }),
      });
    } catch {
      // Ignore corrupted registry entries.
    }
  }
  return jobs;
}

export class AsyncRunManager {
  private readonly runs = new Map<string, RunEntry>();
  private readonly maxCompletedRuns: number;
  private readonly registryDir: string;
  private hydrated = false;

  constructor(options: { maxCompletedRuns?: number; registryDir?: string } = {}) {
    this.maxCompletedRuns = options.maxCompletedRuns ?? 100;
    this.registryDir = options.registryDir ?? defaultRegistryDir();
  }

  private async hydrateIfNeeded(): Promise<void> {
    if (this.hydrated) {
      return;
    }
    this.hydrated = true;
    const jobs = await loadPersistedJobs(this.registryDir);
    for (const job of jobs) {
      if (this.runs.has(job.id)) {
        continue;
      }
      this.runs.set(job.id, {
        job: { ...job },
        abortController: new AbortController(),
      });
    }
  }

  private async saveJob(job: AsyncRunJob): Promise<void> {
    await persistJob(this.registryDir, job);
  }

  start(
    execute: (context: AsyncRunContext) => Promise<RunAgentSessionResult>,
  ): AsyncRunJob {
    const id = createId("run");
    const abortController = new AbortController();
    const job: AsyncRunJob = {
      id,
      status: "running",
      startedAt: nowIso(),
    };
    this.runs.set(id, { job, abortController });
    void this.saveJob(job);

    void execute({ runId: id, abortSignal: abortController.signal })
      .then((result) => {
        if (job.status === "aborted") {
          return;
        }
        job.status = "completed";
        job.sessionId = result.result.sessionId;
        job.result = result;
        job.finishedAt = nowIso();
        void this.saveJob(job);
        this.pruneCompleted();
      })
      .catch((error: unknown) => {
        job.finishedAt = nowIso();
        if (abortController.signal.aborted || job.status === "aborted") {
          job.status = "aborted";
          job.error =
            error instanceof Error ? error.message : "Run aborted.";
          void this.saveJob(job);
          this.pruneCompleted();
          return;
        }
        job.status = "failed";
        job.error = error instanceof Error ? error.message : "Run failed.";
        void this.saveJob(job);
        this.pruneCompleted();
      });

    return { ...job };
  }

  async get(runId: string): Promise<AsyncRunJob | undefined> {
    await this.hydrateIfNeeded();
    const entry = this.runs.get(runId);
    return entry ? { ...entry.job } : undefined;
  }

  async list(limit = 50): Promise<AsyncRunJob[]> {
    await this.hydrateIfNeeded();
    return [...this.runs.values()]
      .map((entry) => ({ ...entry.job }))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, limit);
  }

  async abort(runId: string): Promise<AsyncRunJob | undefined> {
    await this.hydrateIfNeeded();
    const entry = this.runs.get(runId);
    if (!entry) {
      return undefined;
    }
    if (entry.job.status === "running") {
      entry.job.status = "aborted";
      entry.job.finishedAt = nowIso();
      entry.abortController.abort(new Error("Run aborted via API."));
      await this.saveJob(entry.job);
      return { ...entry.job };
    }
    return { ...entry.job };
  }

  private pruneCompleted(): void {
    const completed = [...this.runs.entries()].filter(
      ([, entry]) => entry.job.status !== "running",
    );
    if (completed.length <= this.maxCompletedRuns) {
      return;
    }
    completed
      .sort((left, right) =>
        (left[1].job.finishedAt ?? left[1].job.startedAt).localeCompare(
          right[1].job.finishedAt ?? right[1].job.startedAt,
        ),
      )
      .slice(0, completed.length - this.maxCompletedRuns)
      .forEach(([runId]) => {
        this.runs.delete(runId);
      });
  }
}

export const asyncRunManager = new AsyncRunManager();
