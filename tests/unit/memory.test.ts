import assert from "node:assert/strict";
import { NoopMemoryProvider } from "@code-mind/memory";

export async function runMemoryProviderTests(): Promise<void> {
  const provider = new NoopMemoryProvider();

  await provider.capture({ kind: "test" });
  const summary = await provider.summarize("session_1");
  assert.equal(summary.text, "");

  const search = await provider.search("query", { limit: 5 });
  assert.deepEqual(search, []);

  const injected = await provider.inject({
    sessionId: "session_1",
    taskText: "fix tests",
  });
  assert.deepEqual(injected, []);
}
