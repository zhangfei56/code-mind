import type { Tool } from "@code-mind/shared";
import { READ_TOOLS_MODES } from "@code-mind/shared";
import { LspAdapter } from "../services/lsp-adapter.js";

const lsp = new LspAdapter();

export const lspDiagnosticsTool: Tool<Record<string, never>> = {
  name: "lsp_diagnostics",
  description: "Get lightweight TypeScript diagnostics.",
  riskLevel: "low",
  availableInModes: READ_TOOLS_MODES,
  schema: {
    name: "lsp_diagnostics",
    description: "Get lightweight TypeScript diagnostics.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  async execute(_args, context) {
    const diagnostics = await lsp.diagnostics(context.cwd);
    return {
      success: true,
      output: JSON.stringify({ diagnostics }, null, 2),
      data: { diagnostics },
    };
  },
};
