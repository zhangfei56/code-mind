import assert from "node:assert/strict";
import {
  parseInteractiveCommand,
  renderInteractiveHelp,
} from "../../apps/cli/src/interactive/commands.js";
import { ValidationError } from "@code-mind/shared";

export function runInteractiveTests(): void {
  assert.throws(
    () => parseInteractiveCommand("/mode agent"),
    ValidationError,
  );

  assert.deepEqual(parseInteractiveCommand("/model local:demo"), {
    type: "model",
    model: "local:demo",
  });

  assert.deepEqual(parseInteractiveCommand("/context").type, "context");
  assert.deepEqual(parseInteractiveCommand("/diff").type, "diff");
  assert.deepEqual(parseInteractiveCommand("/approve-always").type, "approve_always");

  assert.match(renderInteractiveHelp(), /\/context/);
  assert.match(renderInteractiveHelp(), /\/diff/);
  assert.match(renderInteractiveHelp(), /ask\|plan\|edit\|agent/);
}
