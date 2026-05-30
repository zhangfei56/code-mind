import { resolve } from "node:path";
import { ValidationError } from "@code-mind/shared";
import { resolveWorkspace } from "@code-mind/workspace";
import type { MockScenario } from "./types.js";
export type { MockScenario } from "./types.js";
import { explainRepoScenario } from "./scenarios/explain-repo.js";
import { shellFailureScenario } from "./scenarios/shell-failure.js";
import { approvalScenario } from "./scenarios/approval.js";

const SCENARIOS: MockScenario[] = [
  explainRepoScenario,
  shellFailureScenario,
  approvalScenario,
];

export function listMockScenarios(): MockScenario[] {
  return SCENARIOS;
}

export function getMockScenario(id: string): MockScenario {
  const scenario = SCENARIOS.find((item) => item.id === id);
  if (!scenario) {
    throw new ValidationError(
      `Unknown mock scenario: ${id}. Available: ${SCENARIOS.map((item) => item.id).join(", ")}`,
    );
  }
  return scenario;
}

export function resolveMockScenario(input: {
  scenarioId: string;
  task?: string;
  cwd: string;
  mode?: MockScenario["mode"];
}): MockScenario {
  const base = getMockScenario(input.scenarioId);
  const cwd = resolveWorkspace(resolve(input.cwd));
  const taskText = input.task?.trim() || base.taskText;
  const mode = input.mode ?? base.mode;

  return {
    ...base,
    cwd,
    taskText,
    mode,
    task: {
      ...base.task,
      text: taskText,
      cwd,
      mode,
    },
  };
}

export { explainRepoScenario, shellFailureScenario, approvalScenario };
