import type { ClarifyPrompter } from "@code-mind/core";
import { createId } from "@code-mind/shared";
import { promptClarifyAnswer } from "../ui/prompt.js";
import type { TerminalComposer } from "../ui/terminal-composer.js";

export interface CliClarifyPrompterOptions {
  onBeforePrompt?: () => void;
  onAfterPrompt?: () => void;
  composer?: TerminalComposer;
}

export class CliClarifyPrompter implements ClarifyPrompter {
  constructor(private readonly options: CliClarifyPrompterOptions = {}) {}

  clarify: ClarifyPrompter["clarify"] = async (request, options) => {
    const clarifyId = createId("clarify");
    await options?.onPending?.(clarifyId);

    this.options.onBeforePrompt?.();
    try {
      if (!process.stdin.isTTY) {
        return { answer: "", clarifyId, skipped: true };
      }
      const answer = await promptClarifyAnswer(request.question, {
        ...(this.options.composer === undefined ? {} : { composer: this.options.composer }),
        ...(this.options.composer?.output === undefined
          ? {}
          : { output: this.options.composer.output }),
      });
      return { answer, clarifyId, skipped: answer.trim().length === 0 };
    } finally {
      this.options.onAfterPrompt?.();
    }
  };
}
