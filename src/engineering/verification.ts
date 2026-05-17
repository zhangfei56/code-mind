import type { TestResult, VerificationResult, VerificationStepResult } from "../shared/types.js";
import { DefaultTestRunner } from "./test-runner.js";

export interface VerificationOptions {
  test?: boolean;
  lint?: boolean;
  build?: boolean;
}

export class VerificationPipeline {
  constructor(private readonly runner: DefaultTestRunner = new DefaultTestRunner()) {}

  async run(projectPath: string, options: VerificationOptions = {}): Promise<VerificationResult> {
    const profile = await this.runner.detect(projectPath);
    const steps: VerificationStepResult[] = [];
    const commands: Array<{ name: string; command?: string; enabled: boolean }> = [
      { name: "test", enabled: options.test ?? true, ...(profile.commands.test === undefined ? {} : { command: profile.commands.test }) },
      { name: "lint", enabled: options.lint ?? true, ...(profile.commands.lint === undefined ? {} : { command: profile.commands.lint }) },
      { name: "build", enabled: options.build ?? true, ...(profile.commands.build === undefined ? {} : { command: profile.commands.build }) },
      { name: "typecheck", enabled: true, ...(profile.commands.typecheck === undefined ? {} : { command: profile.commands.typecheck }) },
    ];

    for (const entry of commands) {
      if (!entry.enabled || !entry.command) {
        continue;
      }

      const result = await this.runner.run(projectPath, entry.command);
      steps.push(this.toStep(entry.name, result));
    }

    return {
      passed: steps.every((step) => step.success),
      steps,
      summary:
        steps.length === 0
          ? "No verification commands detected."
          : steps.map((step) => `${step.name}: ${step.summary}`).join("\n"),
    };
  }

  private toStep(name: string, result: TestResult): VerificationStepResult {
    return {
      name,
      command: result.command,
      success: result.success,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      summary: result.success
        ? "passed"
        : result.summary.errorMessages[0] ?? `failed with exit code ${result.exitCode}`,
    };
  }
}
