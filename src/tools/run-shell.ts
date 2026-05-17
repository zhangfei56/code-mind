import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Tool } from "../shared/types.js";

const execAsync = promisify(exec);
const OUTPUT_LIMIT = 12_000;

interface RunShellArgs {
  command: string;
  timeoutMs?: number;
}

function truncateOutput(value: string): string {
  return value.length <= OUTPUT_LIMIT
    ? value
    : `${value.slice(0, OUTPUT_LIMIT)}\n...[truncated]`;
}

export const runShellTool: Tool<RunShellArgs> = {
  name: "run_shell",
  description: "Run a shell command in the current workspace.",
  riskLevel: "high",
  schema: {
    name: "run_shell",
    description: "Run a shell command in the current workspace.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string" },
        timeoutMs: { type: "number" },
      },
      required: ["command"],
    },
  },
  async execute(args, context) {
    try {
      const result = await execAsync(args.command, {
        cwd: context.cwd,
        timeout: args.timeoutMs ?? 120_000,
        signal: context.abortSignal,
        maxBuffer: 1024 * 1024,
      });

      const output = truncateOutput(
        [result.stdout, result.stderr].filter(Boolean).join("\n"),
      );

      return {
        success: true,
        output,
        exitCode: 0,
      };
    } catch (error) {
      const execError = error as {
        stdout?: string;
        stderr?: string;
        code?: number | string;
        signal?: string;
        message?: string;
      };

      const output = truncateOutput(
        [execError.stdout, execError.stderr, execError.message]
          .filter(Boolean)
          .join("\n"),
      );

      const exitCode =
        typeof execError.code === "number" ? execError.code : undefined;
      const metadata =
        execError.signal === undefined ? undefined : { signal: execError.signal };

      return {
        success: false,
        output,
        error: execError.message ?? "Shell command failed",
        ...(exitCode === undefined ? {} : { exitCode }),
        ...(metadata === undefined ? {} : { metadata }),
      };
    }
  },
};
