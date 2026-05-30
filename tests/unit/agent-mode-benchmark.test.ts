import assert from "node:assert/strict";
import { ValidationError } from "@code-mind/shared";
import { resolveBenchmarkMode } from "../../apps/cli/src/benchmarks/benchmark-mode.js";

export function runAgentModeBenchmarkTests(): void {
  assert.equal(resolveBenchmarkMode({ id: "analysis-01", mode: "ask" }), "ask", "BM-01");
  assert.throws(
    () => resolveBenchmarkMode({ id: "analysis-01" }),
    ValidationError,
    "BM-02",
  );
  assert.equal(resolveBenchmarkMode({ id: "repair-01", mode: "agent" }), "agent", "BM-03");
  assert.equal(resolveBenchmarkMode({ id: "plan-01", mode: "plan" }), "plan", "BM-04");
}
