import assert from "node:assert/strict";
import { renderConfig } from "../../apps/cli/src/commands/config.js";

export function runConfigShowTests(): void {
  const output = renderConfig({
    defaultModel: "local",
    models: {
      local: {
        provider: "openai-compatible",
        baseUrl: "http://localhost:8000/v1",
        apiKey: "EMPTY",
        model: "demo",
      },
    },
    logging: {
      level: "info",
    },
  });

  assert.match(output, /"defaultModel": "local"/);
  assert.match(output, /"provider": "openai-compatible"/);
  assert.match(output, /"level": "info"/);
}
