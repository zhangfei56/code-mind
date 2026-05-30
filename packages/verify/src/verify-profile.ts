import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type PackageManager = "pnpm" | "yarn" | "bun" | "npm";

export interface VerifyProfileCommands {
  test?: string;
  lint?: string;
  build?: string;
  typecheck?: string;
}

export interface VerifyProfileConfig {
  cwd?: string;
  timeoutMs?: number;
  commands?: VerifyProfileCommands;
  enable?: {
    test?: boolean;
    lint?: boolean;
    build?: boolean;
    typecheck?: boolean;
  };
}

export function detectPackageManager(projectPath: string): PackageManager {
  if (existsSync(join(projectPath, "pnpm-lock.yaml")) || existsSync(join(projectPath, "pnpm-workspace.yaml"))) {
    return "pnpm";
  }
  if (existsSync(join(projectPath, "yarn.lock"))) {
    return "yarn";
  }
  if (existsSync(join(projectPath, "bun.lockb")) || existsSync(join(projectPath, "bun.lock"))) {
    return "bun";
  }
  return "npm";
}

export function packageManagerScriptCommand(
  manager: PackageManager,
  script: "test" | "lint" | "build",
): string {
  switch (manager) {
    case "pnpm":
      return script === "test" ? "pnpm test" : `pnpm run ${script}`;
    case "yarn":
      return script === "test" ? "yarn test" : `yarn ${script}`;
    case "bun":
      return script === "test" ? "bun test" : `bun run ${script}`;
    default:
      return script === "test" ? "npm test" : `npm run ${script}`;
  }
}

export async function loadVerifyProfileConfig(
  projectPath: string,
): Promise<VerifyProfileConfig | undefined> {
  const candidates = [
    join(projectPath, ".agent", "verify.json"),
    join(projectPath, ".agent", "verify.config.json"),
    join(projectPath, "verify.config.json"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) {
      continue;
    }
    try {
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw) as VerifyProfileConfig;
    } catch {
      continue;
    }
  }
  return undefined;
}

export function resolveVerificationProjectPath(
  projectPath: string,
  profile?: VerifyProfileConfig,
): string {
  const cwd = profile?.cwd?.trim();
  if (!cwd) {
    return projectPath;
  }
  return join(projectPath, cwd);
}

export const DEFAULT_VERIFY_TIMEOUT_MS = 120_000;
