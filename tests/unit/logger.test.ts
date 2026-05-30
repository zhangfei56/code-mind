import assert from "node:assert/strict";
import { logProcess } from "@code-mind/shared";

export function runLoggerTests(): void {
  const writes: string[] = [];
  const originalWrite = process.stderr.write.bind(process.stderr);
  const previousLevel = process.env.AGENT_LOG_LEVEL;

  process.stderr.write = ((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stderr.write;

  try {
    process.env.AGENT_LOG_LEVEL = "warn";
    logProcess("test.logger", "debug", "hidden");
    logProcess("test.logger", "warn", "shown warn");
    assert.equal(writes.some((entry) => entry.includes("hidden")), false);
    assert.equal(writes.some((entry) => entry.includes("shown warn")), true);

    writes.length = 0;
    process.env.AGENT_LOG_LEVEL = "debug";
    logProcess("test.logger", "debug", "visible debug", { apiKey: "secret" });
    const output = writes.join("");
    assert.match(output, /visible debug/);
    assert.doesNotMatch(output, /secret/);
  } finally {
    process.stderr.write = originalWrite as typeof process.stderr.write;
    if (previousLevel === undefined) {
      delete process.env.AGENT_LOG_LEVEL;
    } else {
      process.env.AGENT_LOG_LEVEL = previousLevel;
    }
  }
}
