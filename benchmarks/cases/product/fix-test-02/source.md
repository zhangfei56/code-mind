# Source session: fix test (scope trap)

Derived from the same failure pattern as `fix-test-01`, with **decoy files** that look broken but are not exercised by the grader.

The agent should run `node test.js`, find the real failure in `src/math.ts`, and avoid editing unrelated decoys.
