import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { DiagnosticItem } from "@code-mind/shared";
import { sanitizeToolOutput } from "../tools/output.js";
import { resolveTypeScriptCommand } from "./typescript.js";

const execAsync = promisify(exec);

export class LspAdapter {
  async diagnostics(projectPath: string): Promise<DiagnosticItem[]> {
    try {
      await execAsync(`${resolveTypeScriptCommand()} --noEmit`, {
        cwd: projectPath,
        timeout: 120_000,
        maxBuffer: 1024 * 1024,
      });
      return [];
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string };
      const output = sanitizeToolOutput(
        [execError.stdout, execError.stderr].filter(Boolean).join("\n"),
      );
      return output
        .split("\n")
        .map((line) => line.match(/^(.+)\((\d+),(\d+)\): error .*: (.+)$/))
        .filter((match): match is RegExpMatchArray => match !== null)
        .map((match) => ({
          path: String(match[1]),
          line: Number.parseInt(String(match[2]), 10),
          message: String(match[4]),
          severity: "error" as const,
        }));
    }
  }
}
