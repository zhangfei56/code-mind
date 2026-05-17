import assert from "node:assert/strict";
import { renderConfig } from "../../src/cli/config-show.js";

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
  });

  assert.match(output, /"defaultModel": "local"/);
  assert.match(output, /"provider": "openai-compatible"/);
}
