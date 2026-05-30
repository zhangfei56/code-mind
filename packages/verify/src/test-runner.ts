import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { TestFailureSummary, TestProfile, TestResult } from "@code-mind/shared";
import { sanitizeToolOutput, truncateToolOutput } from "@code-mind/execution";
import { resolveTypeScriptCommand } from "./typescript.js";
import {
  detectPackageManager,
  packageManagerScriptCommand,
  type VerifyProfileConfig,
} from "./verify-profile.js";
import { DEFAULT_VERIFY_TIMEOUT_MS } from "./verify-profile.js";

const execAsync = promisify(exec);

function emptySummary(rawExcerpt = ""): TestFailureSummary {
  return {
    failedTests: [],
    errorMessages: [],
    likelyFiles: [],
    rawExcerpt,
  };
}

export class DefaultTestRunner {
  async detect(projectPath: string, profile?: VerifyProfileConfig): Promise<TestProfile> {
    if (existsSync(join(projectPath, "package.json"))) {
      const raw = await readFile(join(projectPath, "package.json"), "utf8");
      const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
      const manager = detectPackageManager(projectPath);
      return {
        language: "typescript",
        framework: manager,
        commands: {
          ...(pkg.scripts?.test
            ? { test: profile?.commands?.test ?? packageManagerScriptCommand(manager, "test") }
            : {}),
          ...(pkg.scripts?.lint
            ? { lint: profile?.commands?.lint ?? packageManagerScriptCommand(manager, "lint") }
            : {}),
          ...(pkg.scripts?.build
            ? { build: profile?.commands?.build ?? packageManagerScriptCommand(manager, "build") }
            : {}),
          ...(existsSync(join(projectPath, "tsconfig.json"))
            ? {
                typecheck:
                  profile?.commands?.typecheck ?? `${resolveTypeScriptCommand()} --noEmit`,
              }
            : {}),
        },
      };
    }

    if (existsSync(join(projectPath, "Cargo.toml"))) {
      return {
        language: "rust",
        commands: {
          test: "cargo test",
          build: "cargo check",
        },
      };
    }

    if (existsSync(join(projectPath, "go.mod"))) {
      return {
        language: "go",
        commands: {
          test: "go test ./...",
          build: "go test ./...",
        },
      };
    }

    if (
      existsSync(join(projectPath, "pyproject.toml")) ||
      existsSync(join(projectPath, "pytest.ini"))
    ) {
      return {
        language: "python",
        commands: {
          test: "pytest",
        },
      };
    }

    return {
      language: "unknown",
      commands: {},
    };
  }

  async run(
    projectPath: string,
    command: string,
    options: { timeoutMs?: number } = {},
  ): Promise<TestResult> {
    const startedAt = Date.now();
    const timeoutMs = options.timeoutMs ?? DEFAULT_VERIFY_TIMEOUT_MS;

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: projectPath,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
      });
      const cleanStdout = sanitizeToolOutput(stdout);
      const cleanStderr = sanitizeToolOutput(stderr);
      return {
        success: true,
        command,
        exitCode: 0,
        durationMs: Date.now() - startedAt,
        stdout: cleanStdout,
        stderr: cleanStderr,
        summary: await this.parseOutput(`${cleanStdout}\n${cleanStderr}`),
      };
    } catch (error) {
      const execError = error as {
        stdout?: string;
        stderr?: string;
        code?: number;
        message?: string;
      };
      const stdout = sanitizeToolOutput(execError.stdout ?? "");
      const stderr = sanitizeToolOutput(execError.stderr ?? execError.message ?? "");
      return {
        success: false,
        command,
        exitCode: execError.code ?? 1,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
        summary: await this.parseOutput(`${stdout}\n${stderr}`),
      };
    }
  }

  async parseOutput(output: string): Promise<TestFailureSummary> {
    const sanitized = truncateToolOutput(sanitizeToolOutput(output), { maxChars: 4000 });
    const expectedMatch = sanitized.match(/Expected:\s*(.+)/);
    const receivedMatch = sanitized.match(/Received:\s*(.+)/);
    const fileMatches = [...sanitized.matchAll(/([A-Za-z0-9_./-]+\.(?:test|spec)\.[A-Za-z0-9]+|src\/[A-Za-z0-9_./-]+)/g)].map(
      (match) => match[1],
    );

    if (!expectedMatch && !receivedMatch) {
      return emptySummary(sanitized);
    }

    return {
      failedTests: [
        {
          name: "detected failure",
          message: "Test output contained expected/received mismatch.",
          ...(expectedMatch?.[1] === undefined
            ? {}
            : { expected: expectedMatch[1].trim() }),
          ...(receivedMatch?.[1] === undefined
            ? {}
            : { received: receivedMatch[1].trim() }),
        },
      ],
      errorMessages: sanitized
        .split("\n")
        .filter((line) => /error|failed|expected|received/i.test(line))
        .slice(0, 8),
      likelyFiles: [...new Set(fileMatches.filter((value): value is string => Boolean(value)))].slice(0, 6),
      rawExcerpt: sanitized,
    };
  }
}
