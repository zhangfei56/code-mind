#!/usr/bin/env node

import { resolve } from "node:path";
import { parseArgs } from "./parse-args.js";
import { confirmToolCall, createDefaultProfile } from "./prompt.js";
import { loadConfig } from "../config/load-config.js";
import { createModelProvider } from "../model/provider.js";
import { AgentRuntime } from "../agent/runtime.js";
import { createId } from "../shared/ids.js";
import { nowIso } from "../shared/time.js";
import type { AgentResult, UserTask } from "../shared/types.js";
import { ValidationError } from "../shared/errors.js";

function buildTask(args: ReturnType<typeof parseArgs>): UserTask {
  return {
    id: createId("task"),
    text: args.task,
    cwd: resolve(args.cwd),
    mode: args.mode,
    maxSteps: args.maxSteps,
    metadata: {
      createdAt: nowIso(),
    },
    ...(args.model === undefined ? {} : { requestedModel: args.model }),
  };
}

function render(task: UserTask, result: AgentResult): string {
  const lines = [
    `Task: ${task.text}`,
    `CWD: ${task.cwd}`,
    `Mode: ${task.mode}`,
    `Max steps: ${task.maxSteps}`,
    `Model: ${result.modelName}`,
    `Profile: ${createDefaultProfile().name}`,
    `Status: ${result.status}`,
    `Summary: ${result.summary ?? result.finalText}`,
  ];

  return lines.join("\n");
}

export async function main(argv: string[]): Promise<number> {
  try {
    const args = parseArgs(argv);
    const task = buildTask(args);
    const config = loadConfig();
    const provider = createModelProvider(config, args.model);
    const runtime = new AgentRuntime({
      permissionPrompter: {
        approve(toolCall, decision) {
          return confirmToolCall(toolCall, decision.reason);
        },
      },
    });
    const result = await runtime.run({
      task,
      profile: createDefaultProfile(),
      model: provider,
    });
    console.log(render(task, result));
    return 0;
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error(error.message);
      return 1;
    }

    console.error(error);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
