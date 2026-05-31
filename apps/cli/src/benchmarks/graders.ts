import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { readRunEvents } from "@code-mind/observability";
import type { AgentEvent, AgentResult } from "@code-mind/shared";
import type {
  BenchmarkCase,
  BenchmarkGraders,
  CaseGrade,
  GraderCheck,
} from "./benchmark-types.js";

const execFileAsync = promisify(execFile);

function check(id: string, passed: boolean, message: string): GraderCheck {
  return { id, passed, message };
}

function commandNeedsShell(command: string): boolean {
  return /&&|\|\||[;|<>]/.test(command);
}

async function runVerifyCommand(
  workspaceRoot: string,
  command: string,
  expectedExitCode: number,
): Promise<GraderCheck> {
  const execOptions = {
    cwd: workspaceRoot,
    env: process.env,
    timeout: 120_000,
  };

  try {
    if (commandNeedsShell(command)) {
      await execFileAsync("bash", ["-lc", command], execOptions);
    } else {
      const parts = command.trim().split(/\s+/).filter(Boolean);
      const executable = parts[0] === "node" ? process.execPath : parts[0]!;
      const args = parts[0] === "node" ? parts.slice(1) : parts.slice(1);
      await execFileAsync(executable, args, execOptions);
    }
    return check(
      "verifyCommand",
      expectedExitCode === 0,
      expectedExitCode === 0
        ? `Command succeeded: ${command}`
        : `Expected exit ${expectedExitCode}, got 0`,
    );
  } catch (error) {
    const exitCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "number"
        ? (error as { code: number }).code
        : 1;
    return check(
      "verifyCommand",
      exitCode === expectedExitCode,
      exitCode === expectedExitCode
        ? `Command failed as expected (${exitCode}): ${command}`
        : `Command failed with exit ${exitCode}, expected ${expectedExitCode}: ${command}`,
    );
  }
}

async function checkFilePattern(
  workspaceRoot: string,
  path: string,
  pattern: string,
  shouldContain: boolean,
): Promise<GraderCheck> {
  const filePath = join(workspaceRoot, path);
  try {
    const content = await readFile(filePath, "utf8");
    const matched = new RegExp(pattern).test(content);
    const passed = shouldContain ? matched : !matched;
    return check(
      shouldContain ? `fileContains:${path}` : `fileNotContains:${path}`,
      passed,
      passed
        ? `Pattern ${shouldContain ? "found" : "absent"} in ${path}`
        : `Pattern ${shouldContain ? "missing from" : "unexpected in"} ${path}: /${pattern}/`,
    );
  } catch {
    return check(
      shouldContain ? `fileContains:${path}` : `fileNotContains:${path}`,
      false,
      `Could not read ${path}`,
    );
  }
}

function eventKinds(events: AgentEvent[]): string[] {
  return events.map((event) => event.kind);
}

function countToolCalls(events: AgentEvent[]): number {
  return events.filter((event) => event.kind === "tool.call").length;
}

async function readVerificationPassed(
  workspaceRoot: string,
  sessionId: string,
): Promise<boolean | undefined> {
  try {
    const raw = await readFile(
      join(workspaceRoot, ".agent", "sessions", sessionId, "verification.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as { passed?: boolean };
    return typeof parsed.passed === "boolean" ? parsed.passed : undefined;
  } catch {
    return undefined;
  }
}

export async function gradeBenchmarkCase(input: {
  item: BenchmarkCase;
  workspaceRoot: string;
  result: AgentResult;
  graders?: BenchmarkGraders;
}): Promise<CaseGrade> {
  const graders = input.graders ?? input.item.graders;
  if (!graders) {
    return {
      passed: input.result.status === "success",
      score: input.result.status === "success" ? 1 : 0,
      checks: [
        check(
          "agentStatus",
          input.result.status === "success",
          `Agent status: ${input.result.status}`,
        ),
      ],
    };
  }

  const checks: GraderCheck[] = [];
  const events =
    input.result.runId.length > 0
      ? await readRunEvents(input.workspaceRoot, input.result.runId)
      : [];

  if (graders.verifyCommand) {
    checks.push(
      await runVerifyCommand(
        input.workspaceRoot,
        graders.verifyCommand,
        graders.verifyExitCode ?? 0,
      ),
    );
  }

  for (const rule of graders.fileContains ?? []) {
    checks.push(await checkFilePattern(input.workspaceRoot, rule.path, rule.pattern, true));
  }

  for (const rule of graders.fileNotContains ?? []) {
    checks.push(await checkFilePattern(input.workspaceRoot, rule.path, rule.pattern, false));
  }

  if (graders.maxSteps !== undefined) {
    checks.push(
      check(
        "maxSteps",
        input.result.steps <= graders.maxSteps,
        `Steps ${input.result.steps} / max ${graders.maxSteps}`,
      ),
    );
  }

  if (graders.maxToolCalls !== undefined) {
    const toolCalls = countToolCalls(events);
    checks.push(
      check(
        "maxToolCalls",
        toolCalls <= graders.maxToolCalls,
        `Tool calls ${toolCalls} / max ${graders.maxToolCalls}`,
      ),
    );
  }

  const kinds = eventKinds(events);
  for (const required of graders.requiredEvents ?? []) {
    checks.push(
      check(
        `requiredEvent:${required}`,
        kinds.includes(required),
        kinds.includes(required) ? `Found event ${required}` : `Missing event ${required}`,
      ),
    );
  }

  for (const forbidden of graders.forbiddenEvents ?? []) {
    checks.push(
      check(
        `forbiddenEvent:${forbidden}`,
        !kinds.includes(forbidden),
        kinds.includes(forbidden)
          ? `Unexpected event ${forbidden}`
          : `Event ${forbidden} absent`,
      ),
    );
  }

  if (graders.expectStatus && graders.expectStatus !== "any") {
    checks.push(
      check(
        "expectStatus",
        input.result.status === graders.expectStatus,
        `Agent status ${input.result.status}, expected ${graders.expectStatus}`,
      ),
    );
  }

  const completion =
    typeof input.result.metadata?.completion === "string"
      ? input.result.metadata.completion
      : undefined;
  for (const forbidden of graders.forbiddenCompletion ?? []) {
    checks.push(
      check(
        `forbiddenCompletion:${forbidden}`,
        completion !== forbidden,
        completion === forbidden
          ? `Completion was ${forbidden}`
          : `Completion is not ${forbidden}`,
      ),
    );
  }

  if (graders.requireVerificationPassed) {
    const passed = await readVerificationPassed(input.workspaceRoot, input.result.sessionId);
    checks.push(
      check(
        "verificationPassed",
        passed === true,
        passed === true
          ? "verification.json passed"
          : passed === false
            ? "verification.json failed"
            : "verification.json missing",
      ),
    );
  }

  const passed = checks.every((entry) => entry.passed);
  const score =
    checks.length === 0 ? (passed ? 1 : 0) : Number((checks.filter((c) => c.passed).length / checks.length).toFixed(2));

  return { passed, score, checks };
}
