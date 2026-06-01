import type { SkillConfirmPrompter } from "@code-mind/core";
import { createId } from "@code-mind/shared";
import { promptSkillConfirm } from "../ui/prompt.js";
import type { TerminalComposer } from "../ui/terminal-composer.js";

export interface CliSkillConfirmPrompterOptions {
  onBeforePrompt?: () => void;
  onAfterPrompt?: () => void;
  composer?: TerminalComposer;
}

export class CliSkillConfirmPrompter implements SkillConfirmPrompter {
  constructor(private readonly options: CliSkillConfirmPrompterOptions = {}) {}

  confirm: SkillConfirmPrompter["confirm"] = async (request, options) => {
    const confirmId = createId("skill-confirm");
    await options?.onPending?.(confirmId);

    this.options.onBeforePrompt?.();
    try {
      if (!process.stdin.isTTY) {
        return { confirmed: false, confirmId };
      }
      const confirmed = await promptSkillConfirm(
        {
          skillName: request.skillName,
          skillDescription: request.skillDescription,
          score: request.score,
          reason: request.reason,
        },
        {
          ...(this.options.composer === undefined ? {} : { composer: this.options.composer }),
          ...(this.options.composer?.output === undefined
            ? {}
            : { output: this.options.composer.output }),
          ...(request.locale === undefined ? {} : { locale: request.locale }),
        },
      );
      return { confirmed, confirmId };
    } finally {
      this.options.onAfterPrompt?.();
    }
  };
}
