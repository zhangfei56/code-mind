import assert from "node:assert/strict";
import { DEFAULT_MAX_STEPS } from "@code-mind/shared";
import {
  getModeOverride,
  hasExplicitModeOption,
  runOptionsToCliArgs,
  type RunOptions,
} from "../../apps/cli/src/cli/common-options.js";

function baseRunOptions(overrides: Partial<RunOptions> = {}): RunOptions {
  return {
    cwd: "/tmp/project",
    mode: "edit",
    maxSteps: DEFAULT_MAX_STEPS,
    ...overrides,
  };
}

export function runCommonOptionsTests(): void {
  assert.equal(hasExplicitModeOption(["run", "fix tests"]), false);
  assert.equal(hasExplicitModeOption(["run", "fix tests", "--mode", "agent"]), true);
  assert.equal(hasExplicitModeOption(["run", "fix tests", "--mode=agent"]), true);

  assert.equal(getModeOverride(baseRunOptions(), false), undefined);
  assert.equal(getModeOverride(baseRunOptions({ mode: "agent" }), true), "agent");
  assert.equal(getModeOverride(baseRunOptions({ auto: true }), false), "agent");

  assert.deepEqual(
    runOptionsToCliArgs("fix tests", {
      ...baseRunOptions({ auto: true }),
      modeExplicit: false,
    }),
    {
      task: "fix tests",
      cwd: "/tmp/project",
      mode: "agent",
      modeExplicit: false,
      maxSteps: DEFAULT_MAX_STEPS,
    },
  );
}
