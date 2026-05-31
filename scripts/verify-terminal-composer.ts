/**
 * Verifies pinned bottom-row input: output writes preserve the prompt line.
 */
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { TerminalComposer } from "../apps/cli/src/ui/terminal-composer.js";

async function verifyPinnedPromptSurvivesOutput(): Promise<void> {
  const chunks: string[] = [];
  const output = createFakeTtyStream(chunks);
  const composer = new TerminalComposer({
    input: new PassThrough(),
    promptOutput: output,
  });
  composer.install();
  composer.attachPromptOnly("› ");
  composer.writeAbove("line one\n");
  composer.writeAbove("line two\n");

  const text = chunks.join("");
  assert.ok(!text.includes("\x1b[1;23r"), "must not use DECSTBM scroll region");
  assert.ok(!/\x1b\[23;1H/.test(text), "must not jump to overwrite scroll line");
  assert.doesNotMatch(text, /\r/, "pinned mode avoids carriage-return redraws");

  composer.teardown();
}

function createFakeTtyStream(chunks: string[]): NodeJS.WriteStream {
  const stream = new PassThrough() as NodeJS.WriteStream;
  Object.defineProperty(stream, "isTTY", { value: true });
  Object.defineProperty(stream, "rows", { value: 24, configurable: true });
  Object.defineProperty(stream, "columns", { value: 80, configurable: true });
  const originalWrite = stream.write.bind(stream);
  stream.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
    chunks.push(String(chunk));
    return originalWrite(chunk as string, ...(args as []));
  }) as typeof stream.write;
  return stream;
}

async function main(): Promise<void> {
  await verifyPinnedPromptSurvivesOutput();
  console.log("verify-terminal-composer: all checks passed");
}

main().catch((error: unknown) => {
  console.error("verify-terminal-composer: FAILED");
  console.error(error);
  process.exit(1);
});
