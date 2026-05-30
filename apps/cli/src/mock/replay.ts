import { PassThrough } from "node:stream";
import type { DisplayLevel } from "../ui/display-level.js";
import { ProgressPrinter } from "../ui/progress-printer.js";
import { createProgressPrinter } from "../ui/progress-printer.js";
import { buildRunHeaderDetails } from "../ui/header-details.js";
import type { MockScenario } from "./types.js";
import { sleep } from "./types.js";

export function captureStream(isTTY: boolean): {
  stream: NodeJS.WriteStream;
  text: () => string;
} {
  const chunks: string[] = [];
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.defineProperty(stream, "isTTY", { value: isTTY });
  stream.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof stream.write;
  return { stream, text: () => chunks.join("") };
}

export async function replayMockScenario(
  scenario: MockScenario,
  level: DisplayLevel | "json" | "jsonl",
  options: { isTTY?: boolean; delayMs?: number } = {},
): Promise<{ stderr: string; stdout: string }> {
  const err = captureStream(options.isTTY ?? false);
  const printer =
    level === "json"
      ? createProgressPrinter({ json: true })
      : level === "jsonl"
        ? createProgressPrinter({ jsonl: true })
      : new ProgressPrinter({ level, stream: err.stream });

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
  for (const event of scenario.events) {
    await sleep(options.delayMs ?? 0);
    await printer.onEvent(event);
  }
  printer.dispose();

  const stdout = printer.renderResult(scenario.task, scenario.result);
  return { stderr: err.text(), stdout };
}
