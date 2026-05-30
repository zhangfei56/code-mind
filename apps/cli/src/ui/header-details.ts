import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GitManager } from "@code-mind/execution";
import type { AgentMode } from "@code-mind/shared";
import type { HeaderDetails } from "./progress-printer.js";

export interface BuildHeaderDetailsInput {
  task: string;
  mode: AgentMode;
  cwd: string;
  workspaceRoot?: string;
  cliVersion?: string;
  modelProvider?: string;
  configuredModelName?: string;
  toolCount?: number;
  mcpServerCount?: number;
  configLines?: string[];
}

export function securityInfoForMode(mode: AgentMode): {
  sandbox: string;
  approval: string;
  network: string;
} {
  switch (mode) {
    case "ask":
    case "plan":
      return {
        sandbox: "read-only",
        approval: "never",
        network: "disabled",
      };
    case "edit":
      return {
        sandbox: "workspace-write",
        approval: "on-request",
        network: "disabled",
      };
    case "agent":
      return {
        sandbox: "workspace-write",
        approval: "on-request",
        network: "on-request",
      };
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function getGitSummary(workspaceRoot: string): Promise<string | undefined> {
  try {
    const status = await new GitManager().status(workspaceRoot);
    const dirtyCount =
      status.modified.length + status.untracked.length + status.deleted.length;
    return dirtyCount === 0
      ? `${status.branch}, clean`
      : `${status.branch}, ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}`;
  } catch {
    return undefined;
  }
}

export async function detectProjectSummary(workspaceRoot: string): Promise<string[]> {
  const lines: string[] = [];
  if (await exists(resolve(workspaceRoot, "package.json"))) {
    lines.push("Language: TypeScript/JavaScript");
    lines.push("Package manager: npm/pnpm-compatible");
    try {
      const pkg = JSON.parse(await readFile(resolve(workspaceRoot, "package.json"), "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      if ("express" in deps) {
        lines.push("Framework: Express");
      } else if ("next" in deps) {
        lines.push("Framework: Next.js");
      } else if ("react" in deps) {
        lines.push("Framework: React");
      }
      if ("vitest" in deps) {
        lines.push("Test: Vitest");
      } else if ("jest" in deps) {
        lines.push("Test: Jest");
      }
    } catch {
      // Best-effort display only.
    }
  }
  if (await exists(resolve(workspaceRoot, "pyproject.toml"))) {
    lines.push("Language: Python");
  }
  if (await exists(resolve(workspaceRoot, "Cargo.toml"))) {
    lines.push("Language: Rust");
  }
  if (await exists(resolve(workspaceRoot, "go.mod"))) {
    lines.push("Language: Go");
  }
  if (await exists(resolve(workspaceRoot, "src"))) {
    lines.push("Key dir: src");
  }
  if (await exists(resolve(workspaceRoot, "tests"))) {
    lines.push("Key dir: tests");
  } else if (await exists(resolve(workspaceRoot, "__tests__"))) {
    lines.push("Key dir: __tests__");
  }
  return [...new Set(lines)];
}

export async function detectRootHint(workspaceRoot: string): Promise<string | undefined> {
  const markers = ["package.json", "pyproject.toml", "Cargo.toml", "go.mod", ".git"];
  const found: string[] = [];
  for (const marker of markers) {
    if (await exists(resolve(workspaceRoot, marker))) {
      found.push(marker);
    }
  }
  return found.length > 0 ? `detected ${found.join(", ")}` : undefined;
}

export async function buildRunHeaderDetails(
  input: BuildHeaderDetailsInput,
): Promise<HeaderDetails> {
  const workspaceRoot = input.workspaceRoot ?? input.cwd;
  const security = securityInfoForMode(input.mode);
  const gitSummary = await getGitSummary(workspaceRoot);
  const rootHint = await detectRootHint(workspaceRoot);

  return {
    ...(input.cliVersion === undefined ? {} : { cliVersion: input.cliVersion }),
    workspaceRoot,
    ...(rootHint === undefined ? {} : { rootHint }),
    ...(gitSummary === undefined ? {} : { gitSummary }),
    ...(input.modelProvider === undefined ? {} : { modelProvider: input.modelProvider }),
    ...(input.configuredModelName === undefined
      ? {} : { configuredModelName: input.configuredModelName }),
    ...(input.toolCount === undefined ? {} : { toolCount: input.toolCount }),
    ...(input.mcpServerCount === undefined ? {} : { mcpServerCount: input.mcpServerCount }),
    ...(input.configLines === undefined ? {} : { configLines: input.configLines }),
    detectedLines: await detectProjectSummary(workspaceRoot),
    sandboxMode: security.sandbox,
    approvalMode: security.approval,
    networkMode: security.network,
  };
}
