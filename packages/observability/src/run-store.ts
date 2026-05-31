import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  getRunArtifactsDir,
  getRunDir,
  getRunsRoot,
} from "@code-mind/workspace";
import type { AgentEvent, AgentResultStatus } from "@code-mind/shared";

export interface RunManifest {
  runId: string;
  sessionId: string;
  parentRunId?: string;
  task: string;
  mode: string;
  cwd: string;
  model: string;
  status: AgentResultStatus | "running";
  startedAt: string;
  finishedAt?: string;
  eventCount: number;
  artifactBytes: number;
  rawLogging?: boolean;
}

export interface RunSummary {
  runId: string;
  sessionId: string;
  status: AgentResultStatus | "running";
  steps: number;
  modelCalls: number;
  toolCalls: number;
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
  uncachedInputTokens?: number;
  wallTimeMs: number;
  finishedAt: string;
}

export class RunStore {
  private pendingLines: string[] = [];
  private eventCount = 0;
  private artifactBytes = 0;

  constructor(
    private readonly workspaceRoot: string,
    private readonly manifest: RunManifest,
  ) {}

  static async create(
    workspaceRoot: string,
    manifest: Omit<RunManifest, "eventCount" | "artifactBytes" | "status"> & {
      status?: RunManifest["status"];
    },
  ): Promise<RunStore> {
    const full: RunManifest = {
      ...manifest,
      status: manifest.status ?? "running",
      eventCount: 0,
      artifactBytes: 0,
    };
    const store = new RunStore(workspaceRoot, full);
    await store.init();
    return store;
  }

  get runId(): string {
    return this.manifest.runId;
  }

  get sessionId(): string {
    return this.manifest.sessionId;
  }

  getRunDir(): string {
    return getRunDir(this.workspaceRoot, this.manifest.runId);
  }

  async init(): Promise<void> {
    const dir = this.getRunDir();
    await mkdir(dir, { recursive: true });
    await mkdir(getRunArtifactsDir(this.workspaceRoot, this.manifest.runId), {
      recursive: true,
    });
    await this.writeManifest();
  }

  async appendEvent(event: AgentEvent): Promise<void> {
    this.eventCount += 1;
    this.pendingLines.push(`${JSON.stringify(event)}\n`);
  }

  async flush(): Promise<void> {
    if (this.pendingLines.length === 0) {
      return;
    }
    const eventsPath = join(this.getRunDir(), "events.jsonl");
    const chunk = this.pendingLines.join("");
    this.pendingLines = [];
    await appendFile(eventsPath, chunk, "utf8");
    this.manifest.eventCount = this.eventCount;
    await this.writeManifest();
  }

  async storeArtifact(
    artifactId: string,
    content: string,
    kind: "prompt" | "tool_output" | "diff" | "blob" = "blob",
  ): Promise<{ id: string; bytes: number; sha256: string; preview: string }> {
    const bytes = Buffer.byteLength(content, "utf8");
    const sha256 = createHash("sha256").update(content).digest("hex");
    const dir = getRunArtifactsDir(this.workspaceRoot, this.manifest.runId);
    await mkdir(dir, { recursive: true });
    const fileName = `${artifactId}.${kind === "diff" ? "diff" : "txt"}`;
    await writeFile(join(dir, fileName), content, "utf8");
    this.artifactBytes += bytes;
    this.manifest.artifactBytes = this.artifactBytes;
    await this.writeManifest();
    return {
      id: artifactId,
      bytes,
      sha256,
      preview: content.slice(0, 200),
    };
  }

  async finish(status: AgentResultStatus, summary: RunSummary): Promise<void> {
    this.manifest.status = status;
    this.manifest.finishedAt = summary.finishedAt;
    await this.flush();
    await writeFile(
      join(this.getRunDir(), "summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    );
    await this.writeManifest();
  }

  private async writeManifest(): Promise<void> {
    await writeFile(
      join(this.getRunDir(), "manifest.json"),
      `${JSON.stringify(this.manifest, null, 2)}\n`,
      "utf8",
    );
  }
}

export async function readRunEvents(
  workspaceRoot: string,
  runId: string,
): Promise<AgentEvent[]> {
  const filePath = join(getRunDir(workspaceRoot, runId), "events.jsonl");
  try {
    const content = await readFile(filePath, "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as AgentEvent);
  } catch {
    return [];
  }
}

export async function listRunIds(workspaceRoot: string): Promise<string[]> {
  const root = getRunsRoot(workspaceRoot);
  try {
    const entries = await readdir(root);
    return entries.sort();
  } catch {
    return [];
  }
}

export async function readRunManifest(
  workspaceRoot: string,
  runId: string,
): Promise<RunManifest | undefined> {
  try {
    const content = await readFile(
      join(getRunDir(workspaceRoot, runId), "manifest.json"),
      "utf8",
    );
    return JSON.parse(content) as RunManifest;
  } catch {
    return undefined;
  }
}
