import type { RunMode } from "../shared/types.js";
import { ValidationError } from "../shared/errors.js";

export interface CliArgs {
  task: string;
  cwd: string;
  model?: string;
  mode: RunMode;
  maxSteps: number;
}

const RUN_MODES: readonly RunMode[] = [
  "read_only",
  "suggest",
  "auto_edit",
  "full_auto",
  "sandbox_auto",
];

export function parseArgs(argv: string[]): CliArgs {
  const positional: string[] = [];
  let cwd = process.cwd();
  let model: string | undefined;
  let mode: RunMode = "suggest";
  let maxSteps = 10;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === undefined) {
      continue;
    }

    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }

    const next = argv[index + 1];

    switch (value) {
      case "--cwd":
        if (!next) {
          throw new ValidationError("Missing value for --cwd");
        }
        cwd = next;
        index += 1;
        break;
      case "--model":
        if (!next) {
          throw new ValidationError("Missing value for --model");
        }
        model = next;
        index += 1;
        break;
      case "--mode":
        if (!next) {
          throw new ValidationError("Missing value for --mode");
        }
        if (!RUN_MODES.includes(next as RunMode)) {
          throw new ValidationError(`Invalid mode: ${next}`);
        }
        mode = next as RunMode;
        index += 1;
        break;
      case "--max-steps":
        if (!next) {
          throw new ValidationError("Missing value for --max-steps");
        }
        maxSteps = Number.parseInt(next, 10);
        if (!Number.isInteger(maxSteps) || maxSteps <= 0) {
          throw new ValidationError("Expected --max-steps to be a positive integer");
        }
        index += 1;
        break;
      default:
        throw new ValidationError(`Unknown argument: ${value}`);
    }
  }

  const task = positional.join(" ").trim();
  if (!task) {
    throw new ValidationError("Missing task. Usage: agent \"<task>\" [--cwd .] [--model name] [--mode suggest] [--max-steps 10]");
  }

  return {
    task,
    cwd,
    mode,
    maxSteps,
    ...(model === undefined ? {} : { model }),
  };
}
