import { createInterface } from "./readline-interface.js";
import { stdin as input, stderr as defaultApprovalOutput, stdout as output } from "node:process";
import type { AgentProfile } from "@code-mind/shared";
import { createDefaultAgentProfile, type DefaultAgentProfileOptions } from "@code-mind/models";
import { theme } from "./theme.js";
import type { TerminalComposer } from "./terminal-composer.js";

export type { DefaultAgentProfileOptions };

/** @deprecated Use createDefaultAgentProfile from @code-mind/models in new code. */
export function createDefaultProfile(
  modelName?: string,
  options: DefaultAgentProfileOptions = {},
): AgentProfile {
  return createDefaultAgentProfile(modelName, options);
}

export type ApprovalChoice = "once" | "always" | "deny";

export interface ApprovalPromptOptions {
  /** Where the approval readline prompt is rendered (default stderr, separate from stdout). */
  output?: NodeJS.WriteStream;
  composer?: TerminalComposer;
}

function buildApprovalPromptLine(output: NodeJS.WriteStream): string {
  return `${theme.yellow("approval", output)} ${theme.dim("›", output)} [y] once  [a] always  [n] no  [e] explain: `;
}

export async function promptApprovalDecision(
  options: ApprovalPromptOptions = {},
): Promise<ApprovalChoice> {
  const output = options.output ?? defaultApprovalOutput;
  const composer = options.composer;
  const ttyOutput = composer?.output ?? output;
  if (!process.stdin.isTTY || !ttyOutput.isTTY) {
    return "deny";
  }

  const promptLine = buildApprovalPromptLine(ttyOutput);
  if (composer) {
    composer.setPrompt(promptLine);
    composer.writeAbove("\n");
    while (true) {
      const answer = await composer.ask(promptLine);
      const choice = parseApprovalChoice(answer, ttyOutput, composer);
      if (choice !== "retry") {
        return choice;
      }
    }
  }

  output.write("\n");
  const rl = createInterface({ input, output });
  try {
    while (true) {
      const answer = await rl.question(promptLine);
      const choice = parseApprovalChoice(answer, output);
      if (choice !== "retry") {
        return choice;
      }
    }
  } finally {
    rl.close();
  }
}

function parseApprovalChoice(
  answer: string,
  output: NodeJS.WriteStream,
  composer?: TerminalComposer,
): ApprovalChoice | "retry" {
  const trimmed = answer.trim().toLowerCase();
  if (trimmed === "y" || trimmed === "yes") {
    return "once";
  }
  if (trimmed === "a" || trimmed === "always") {
    return "always";
  }
  if (trimmed === "n" || trimmed === "no" || trimmed === "") {
    return "deny";
  }
  if (trimmed === "e" || trimmed === "explain") {
    const message = `${theme.dim("  This action needs explicit approval before the agent can continue in your workspace.", output)}\n`;
    if (composer?.isPinned()) {
      composer.writeAbove(message);
    } else {
      output.write(message);
    }
    return "retry";
  }
  return "retry";
}

export async function confirmAction(
  prompt: string,
  options: { showApprovalChoices?: boolean } = {},
): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }

  const rl = createInterface({ input, output });
  try {
    const suffix = options.showApprovalChoices
      ? " [y/a/N/e] "
      : " [y/N] ";
    const answer = await rl.question(`${prompt}${suffix}`);
    const trimmed = answer.trim().toLowerCase();
    return trimmed === "y" || trimmed === "yes" || trimmed === "a" || trimmed === "always";
  } finally {
    rl.close();
  }
}

export interface ClarifyPromptOptions {
  output?: NodeJS.WriteStream;
  composer?: TerminalComposer;
}

export interface SkillConfirmPromptOptions {
  output?: NodeJS.WriteStream;
  composer?: TerminalComposer;
  locale?: "en" | "zh";
}

export async function promptSkillConfirm(
  skillRequest: {
    skillName: string;
    skillDescription: string;
    score: number;
    reason: string;
  },
  options: SkillConfirmPromptOptions = {},
): Promise<boolean> {
  const output = options.output ?? defaultApprovalOutput;
  const composer = options.composer;
  const ttyOutput = composer?.output ?? output;
  if (!process.stdin.isTTY || !ttyOutput.isTTY) {
    return false;
  }

  const locale = options.locale ?? "en";
  const question =
    locale === "zh"
      ? `是否启用 skill "${skillRequest.skillName}"？（匹配分 ${skillRequest.score}）\n${skillRequest.skillDescription}\n${skillRequest.reason} [y/N]`
      : `Enable skill "${skillRequest.skillName}"? (score ${skillRequest.score})\n${skillRequest.skillDescription}\n${skillRequest.reason} [y/N]`;
  const promptLine =
    locale === "zh"
      ? `${theme.cyan("skill", ttyOutput)} ${theme.dim("›", ttyOutput)} [y/N] `
      : `${theme.cyan("skill", ttyOutput)} ${theme.dim("›", ttyOutput)} [y/N] `;

  if (composer) {
    composer.writeAbove(`${theme.cyan("skill", ttyOutput)} ${theme.dim("›", ttyOutput)} ${question}\n`);
    composer.setPrompt(promptLine);
    const answer = await composer.ask(promptLine);
    return /^y(es)?$/i.test(answer.trim());
  }

  output.write(`${question}\n`);
  const rl = createInterface({ input, output: ttyOutput });
  try {
    const answer = await rl.question(promptLine);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

export async function promptClarifyAnswer(
  question: string,
  options: ClarifyPromptOptions = {},
): Promise<string> {
  const output = options.output ?? defaultApprovalOutput;
  const composer = options.composer;
  const ttyOutput = composer?.output ?? output;
  if (!process.stdin.isTTY || !ttyOutput.isTTY) {
    return "";
  }

  const header = `${theme.cyan("clarify", ttyOutput)} ${theme.dim("›", ttyOutput)} ${question}\n`;
  const promptLine = `${theme.cyan("clarify", ttyOutput)} ${theme.dim("›", ttyOutput)} `;

  if (composer) {
    composer.writeAbove(header);
    composer.setPrompt(promptLine);
    return composer.ask(promptLine);
  }

  output.write(header);
  const rl = createInterface({ input, output: ttyOutput });
  try {
    return await rl.question(promptLine);
  } finally {
    rl.close();
  }
}