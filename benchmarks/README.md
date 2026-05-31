# code-mind Benchmark / Eval

Graded end-to-end evals for measuring whether agent changes help or hurt.

## Quick start

```bash
# T1 micro suite (6 cases, real model)
pnpm eval:micro

# T1 polyglot subset (16 Aider-standard exercises)
pnpm eval:polyglot

# T2 product cases from real failed sessions
pnpm eval:product

# Save baseline after a good run
pnpm eval:micro:baseline
pnpm eval:polyglot:baseline
pnpm eval:product:baseline

# Compare against baseline (exit 2 on regression)
pnpm eval:compare
```

Requires a configured model (see [docs/user-guide.md](../docs/user-guide.md)).

## Workloads

| File | Tier | Cases | Purpose |
|------|------|-------|---------|
| `workloads/t1-micro.json` | T1 | 6 | Repair / verify / implement on `examples/ts-bug-demo` |
| `workloads/t1-polyglot.json` | T1 | 16 | Aider polyglot subset (8 Python + 8 JS) |
| `workloads/t2-product.json` | T2 | 2 | Vague "fix test" cases from real sessions |
| `workloads/t2-swebench-dev.json` | T2 | 23 | SWE-bench Lite dev (real GitHub issues) |
| `../p0-workload.json` | legacy | 10 | Original ungraded workload (`pnpm benchmark:p0`) |

## Polyglot (Aider standard)

Vendor exercises live at `vendor/polyglot-benchmark/` (from [Aider-AI/polyglot-benchmark](https://github.com/Aider-AI/polyglot-benchmark)). This directory is **not** committed to git; clone or sparse-checkout it locally before running polyglot evals:

```bash
git clone --depth 1 https://github.com/Aider-AI/polyglot-benchmark.git benchmarks/vendor/polyglot-benchmark
```

Each case copies an isolated exercise workspace, loads `.docs/instructions.md`, and grades with language-specific test commands (`pytest` / `npm test`).

```bash
# Run one exercise
pnpm eval:polyglot -- --ids polyglot-py-beer-song
```

## Product cases

Real failure sessions are distilled under `cases/product/`:

```
cases/product/fix-test-01/
  source.md       # original session notes
  case.json       # graders + metadata
  instruction.md  # user prompt ("fix test")
  verify.sh       # objective check
  workspace/      # minimal repro
```

Workload entries reference `productCase` and merge manifest fields via `load-workload.ts`.

## SWE-bench Lite dev

```bash
# Refresh workload from HuggingFace (23 dev instances)
pnpm benchmark:swebench:fetch

# Run agent + export predictions.jsonl for official grading
pnpm eval:swebench

# Single instance
pnpm eval:swebench -- --ids swebench-sqlfluff-sqlfluff-1625
```

- Instance metadata: `vendor/swebench-dev-instances.json`
- Repo cache: `benchmarks/.cache/swebench-repos/` (gitignored)
- Predictions: `.agent/benchmarks/swebench/*-predictions.jsonl`

Grade patches with the [official SWE-bench harness](https://github.com/SWE-bench/SWE-bench) (Docker).

## Grading

Each case may define `graders`:

- `verifyCommand` + `verifyExitCode` — objective test pass/fail (primary for repair)
- `fileContains` / `fileNotContains` — patch outcome checks
- `maxSteps` / `maxToolCalls` — efficiency & convergence
- `requiredEvents` / `forbiddenEvents` — process checks via `events.jsonl`
- `requireVerificationPassed` — reads session `verification.json`
- `forbiddenCompletion` — e.g. block `stopped_by_limit`

**Resolved rate** = cases where all grader checks pass. This is the main metric for regression detection.

## Artifacts

- Run reports: `.agent/benchmarks/<run-id>.json`
- Baselines: `benchmarks/baselines/<workload>-<model>.json`

## Compare workflow

```bash
# 1. Establish baseline (once per model + workload)
BENCHMARK_MODEL=your-model pnpm eval:micro:baseline

# 2. After changes
BENCHMARK_MODEL=your-model pnpm eval:micro

# 3. Compare
pnpm eval:compare -- benchmarks/baselines/t1-micro-your-model.json
```
