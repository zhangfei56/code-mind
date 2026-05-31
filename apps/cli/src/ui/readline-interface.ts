import { createInterface as createCallbackInterface } from "node:readline";
import type { Interface as ReadlineInterface } from "node:readline";

export interface PromiseReadlineInterface {
  question(prompt: string): Promise<string>;
  close(): void;
}

/** Promise-based readline compatible with Node 16+ (no node:readline/promises). */
export function createInterface(options: {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}): PromiseReadlineInterface {
  const rl: ReadlineInterface = createCallbackInterface(options);
  return {
    question(prompt: string): Promise<string> {
      return new Promise((resolve) => {
        rl.question(prompt, resolve);
      });
    },
    close(): void {
      rl.close();
    },
  };
}
