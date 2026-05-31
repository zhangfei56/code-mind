import assert from "node:assert/strict";
import { join } from "node:path";
import { loadWorkloadCases } from "../../apps/cli/src/benchmarks/load-workload.js";
import {
  formatPolyglotPrompt,
  isPolyglotExerciseAvailable,
  polyglotExerciseDir,
  readPolyglotInstructions,
} from "../../apps/cli/src/benchmarks/polyglot-workspace.js";

export async function runBenchmarkWorkloadTests(): Promise<void> {
  const root = join(process.cwd());

  const micro = await loadWorkloadCases(root, "workloads/t1-micro.json");
  assert.equal(micro.length, 6);
  assert.equal(micro[0]?.id, "micro-repair-01");

  const product = await loadWorkloadCases(root, "workloads/t2-product.json");
  assert.equal(product.length, 2);
  assert.equal(product[0]?.id, "product-fix-test-01");
  assert.equal(product[0]?.mode, "agent");
  assert.match(product[0]?.graders?.verifyCommand ?? "", /node test\.js/);
  assert.equal(product[0]?.workspace, "benchmarks/cases/product/fix-test-01/workspace");

  const polyglot = await loadWorkloadCases(root, "workloads/t1-polyglot.json");
  assert.equal(polyglot.length, 16);
  assert.ok(polyglot.every((item) => item.polyglot));

  const beerSong = polyglot.find((item) => item.id === "polyglot-py-beer-song");
  assert.ok(beerSong?.polyglot);
  const beerSongRef = beerSong.polyglot;
  assert.match(polyglotExerciseDir(root, beerSongRef), /python\/exercises\/practice\/beer-song$/);

  const formatted = formatPolyglotPrompt(
    beerSongRef,
    "# Instructions\n\nRecite the lyrics to beer-song.",
  );
  assert.match(formatted, /beer-song/i);
  assert.match(formatted, /Implement the beer-song exercise/);
  assert.match(formatted, /Recite the lyrics to beer-song/);

  if (await isPolyglotExerciseAvailable(root, beerSongRef)) {
    const instructions = await readPolyglotInstructions(root, beerSongRef);
    assert.match(instructions, /beer-song/i);
    assert.match(instructions, /Implement the beer-song exercise/);
  }
}
