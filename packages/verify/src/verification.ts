import type { TestResult, VerificationResult, VerificationStepResult } from "@code-mind/shared";
import { DefaultTestRunner } from "./test-runner.js";
import {
  loadVerifyProfileConfig,
  resolveVerificationProjectPath,
} from "./verify-profile.js";

import {
  resolveVerificationOptions,
  resolveVerificationTimeoutMs,
} from "./verification-options.js";
import type { VerificationOptions } from "./verification-options.js";

export class VerificationPipeline {
  constructor(private readonly runner: DefaultTestRunner = new DefaultTestRunner()) {}

  async run(projectPath: string, options: VerificationOptions = {}): Promise<VerificationResult> {
    const profile = await loadVerifyProfileConfig(projectPath);
    const resolvedOptions = resolveVerificationOptions(profile, options);
    const targetPath = resolveVerificationProjectPath(projectPath, profile);
    const timeoutMs = resolveVerificationTimeoutMs(resolvedOptions, profile);
    const detected = await this.runner.detect(targetPath, profile);
    const commands = {
      ...detected.commands,
      ...profile?.commands,
      ...resolvedOptions.commands,
    };
    const steps: VerificationStepResult[] = [];
    const entries: Array<{ name: string; command?: string; enabled: boolean }> = [
      { name: "test", enabled: resolvedOptions.test ?? true, ...(commands.test === undefined ? {} : { command: commands.test }) },
      { name: "lint", enabled: resolvedOptions.lint ?? true, ...(commands.lint === undefined ? {} : { command: commands.lint }) },
      { name: "build", enabled: resolvedOptions.build ?? true, ...(commands.build === undefined ? {} : { command: commands.build }) },
      { name: "typecheck", enabled: resolvedOptions.typecheck ?? true, ...(commands.typecheck === undefined ? {} : { command: commands.typecheck }) },
    ];

    for (const entry of entries) {
      if (!entry.enabled || !entry.command) {
        continue;
      }

      const result = await this.runner.run(targetPath, entry.command, { timeoutMs });
      steps.push(this.toStep(entry.name, result));
    }

    return {
      passed: steps.length > 0 && steps.every((step) => step.success),
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
