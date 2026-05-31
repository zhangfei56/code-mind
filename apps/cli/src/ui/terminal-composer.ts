import {
  clearLine,
  createInterface,
  cursorTo,
  type Interface as ReadlineInterface,
} from "node:readline";
import { stdin as defaultInput, stderr as defaultPromptOutput } from "node:process";

export interface TerminalComposerOptions {
  input?: NodeJS.ReadableStream;
  promptOutput?: NodeJS.WriteStream;
}

/**
 * Pins readline to the bottom row. Agent output uses pause → clear input line →
 * print → prompt(true) so partial user input is preserved.
 */
export class TerminalComposer {
  private readonly input: NodeJS.ReadableStream;
  private readonly promptOutput: NodeJS.WriteStream;
  private rl: ReadlineInterface | undefined;
  private pinned = false;
  private promptText = "";
  private lineHandler: ((line: string) => void | Promise<void>) | undefined;
  private lineBusy = false;

  constructor(options: TerminalComposerOptions = {}) {
    this.input = options.input ?? defaultInput;
    this.promptOutput = options.promptOutput ?? defaultPromptOutput;
  }

  isPinned(): boolean {
    return this.pinned;
  }

  hasActivePrompt(): boolean {
    return this.rl !== undefined;
  }

  get output(): NodeJS.WriteStream {
    return this.promptOutput;
  }

  install(): void {
    if (this.pinned || !this.promptOutput.isTTY) {
      return;
    }
    this.pinned = true;
  }

  teardown(): void {
    if (!this.pinned) {
      return;
    }
    this.pinned = false;
    this.rl?.close();
    this.rl = undefined;
    this.lineHandler = undefined;
    this.lineBusy = false;
  }

  setPrompt(prompt: string): void {
    this.promptText = prompt;
    this.rl?.setPrompt(prompt);
  }

  refreshPrompt(): void {
    this.rl?.prompt(true);
  }

  /** Create readline for prompt redraw without accepting input yet (run mode). */
  attachPromptOnly(prompt: string): void {
    this.ensureReadline();
    this.setPrompt(prompt);
    this.refreshPrompt();
  }

  /** Begin accepting lines until teardown(). */
  startLineListener(handler: (line: string) => void | Promise<void>): ReadlineInterface {
    this.ensureReadline();
    this.lineHandler = handler;
    this.rl!.removeAllListeners("line");
    this.rl!.on("line", (line) => {
      if (!this.lineHandler || this.lineBusy) {
        this.refreshPrompt();
        return;
      }
      this.lineBusy = true;
      void Promise.resolve(this.lineHandler(line))
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          this.writeAbove(`${message}\n`);
        })
        .finally(() => {
          this.lineBusy = false;
          this.refreshPrompt();
        });
    });
    this.refreshPrompt();
    return this.rl!;
  }

  /** One-shot question while pinned (run-mode approval). */
  async ask(prompt: string): Promise<string> {
    this.ensureReadline();
    this.setPrompt(prompt);
    return new Promise((resolve) => {
      const handler = (line: string): void => {
        this.rl?.off("line", handler);
        resolve(line);
      };
      this.rl!.on("line", handler);
      this.refreshPrompt();
    });
  }

  /**
   * Write agent output above the pinned prompt.
   * When readline is active, always writes to the prompt stream so prompt(true) works.
   */
  writeAbove(text: string): void {
    if (!text) {
      return;
    }
    if (!this.pinned || !this.promptOutput.isTTY) {
      this.promptOutput.write(text);
      return;
    }

    const payload = text.endsWith("\n") ? text : `${text}\n`;
    if (!this.rl) {
      this.promptOutput.write(payload);
      return;
    }

    this.rl.pause();
    clearLine(this.promptOutput, 0);
    cursorTo(this.promptOutput, 0);
    this.promptOutput.write(payload);
    this.rl.resume();
    this.rl.prompt(true);
  }

  private ensureReadline(): void {
    if (this.rl) {
      return;
    }
    this.rl = createInterface({
      input: this.input,
      output: this.promptOutput,
      terminal: true,
      historySize: 200,
    });
    if (this.promptText) {
      this.rl.setPrompt(this.promptText);
    }
  }
}

/** Write startup banner before the composer is installed. */
export function writeUnpinned(text: string, stream: NodeJS.WriteStream = defaultPromptOutput): void {
  if (!stream.isTTY) {
    stream.write(text);
    return;
  }
  clearLine(stream, 0);
  cursorTo(stream, 0);
  stream.write(text.endsWith("\n") ? text : `${text}\n`);
}
