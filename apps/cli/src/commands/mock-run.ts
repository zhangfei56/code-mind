import type { RunCliArgs } from "../cli/parse-args.js";
import { resolveMockScenario, type MockScenario } from "../mock/index.js";
import { sleep } from "../mock/types.js";
import { createProgressPrinter } from "../ui/progress-printer.js";
import { buildRunHeaderDetails } from "../ui/header-details.js";
import { isAgentRunSuccessful } from "@code-mind/core";

export interface MockRunInput {
  scenarioId: string;
  run: RunCliArgs;
  delayMs?: number;
}

export async function executeMockRun(input: MockRunInput): Promise<number> {
  const scenario = resolveMockScenario({
    scenarioId: input.scenarioId,
    task: input.run.task,
    cwd: input.run.cwd,
    mode: input.run.mode,
  });

  const printer = createProgressPrinter({
    ...(input.run.json ? { json: true } : {}),
    ...(input.run.jsonl ? { jsonl: true } : {}),
    ...(input.run.verbose ? { verbose: true } : {}),
    ...(input.run.trace ? { trace: true } : {}),
    ...(input.run.debug ? { debug: true } : {}),
  });

  printer.printHeader(
    scenario.taskText,
    scenario.mode,
    scenario.cwd,
    await buildRunHeaderDetails({
      task: scenario.taskText,
      mode: scenario.mode,
      cwd: scenario.cwd,
      cliVersion: "0.1.0",
      configuredModelName: scenario.result.modelName,
      modelProvider: scenario.result.modelName,
    }),
  );

  const delayMs = input.delayMs ?? 0;
  for (const event of scenario.events) {
    await sleep(delayMs);
    await printer.onEvent(event);
  }

  console.log(printer.renderResult(scenario.task, scenario.result));
  printer.dispose();

  return isAgentRunSuccessful(scenario.result) ? 0 : 1;
}

export function renderMockScenarioList(scenarios: MockScenario[]): string {
  return scenarios
    .map((item) => `${item.id.padEnd(16)} ${item.description}`)
    .join("\n");
}

export async function executeMockList(): Promise<number> {
  const { listMockScenarios } = await import("../mock/index.js");
  console.log(renderMockScenarioList(listMockScenarios()));
  console.log("");
  console.log("Usage:");
  console.log('  code-mind mock run "explain this repo" --scenario explain-repo');
  console.log("  code-mind mock run --scenario shell-failure --verbose");
  console.log("  code-mind mock run --scenario approval --delay 300");
  return 0;
}
