import type { Tool } from "@code-mind/shared";
import { READ_TOOLS_MODES } from "@code-mind/shared";
import { LspAdapter } from "../services/lsp-adapter.js";
import {
  findDefinition,
  findReferences,
  getDocumentSymbols,
} from "../services/typescript-language-service.js";
import { truncateToolOutput } from "./output.js";

const lsp = new LspAdapter();

interface LspPathArgs {
  path: string;
}

interface LspPositionArgs extends LspPathArgs {
  line: number;
  character: number;
}

function formatUnavailable(message: string): string {
  return JSON.stringify({ available: false, message }, null, 2);
}

export const lspDiagnosticsTool: Tool<Record<string, never>> = {
  name: "lsp_diagnostics",
  description: "Get lightweight TypeScript diagnostics for the workspace cwd.",
  riskLevel: "low",
  availableInModes: READ_TOOLS_MODES,
  schema: {
    name: "lsp_diagnostics",
    description: "Get lightweight TypeScript diagnostics for the workspace cwd.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  async execute(_args, context) {
    const diagnostics = await lsp.diagnostics(context.cwd);
    return {
      success: true,
      output: truncateToolOutput(JSON.stringify({ diagnostics }, null, 2)),
      data: { diagnostics },
    };
  },
};

export const lspSymbolsTool: Tool<LspPathArgs> = {
  name: "lsp_symbols",
  description: "List document symbols for a TypeScript/JavaScript file.",
  riskLevel: "low",
  availableInModes: READ_TOOLS_MODES,
  schema: {
    name: "lsp_symbols",
    description: "List document symbols for a TypeScript/JavaScript file.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative file path." },
      },
      required: ["path"],
    },
  },
  async execute(args, context) {
    const symbols = getDocumentSymbols(context.workspaceRoot, args.path);
    if (symbols === undefined) {
      return {
        success: false,
        output: formatUnavailable("TypeScript language service is unavailable in this workspace."),
        error: "TypeScript language service unavailable.",
      };
    }
    return {
      success: true,
      output: truncateToolOutput(JSON.stringify({ symbols }, null, 2)),
      data: { symbols },
    };
  },
};

export const lspDefinitionTool: Tool<LspPositionArgs> = {
  name: "lsp_definition",
  description: "Find the definition location for a symbol at line/character in a file.",
  riskLevel: "low",
  availableInModes: READ_TOOLS_MODES,
  schema: {
    name: "lsp_definition",
    description: "Find the definition location for a symbol at line/character in a file.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        line: { type: "number" },
        character: { type: "number" },
      },
      required: ["path", "line", "character"],
    },
  },
  async execute(args, context) {
    const locations = findDefinition(
      context.workspaceRoot,
      args.path,
      args.line,
      args.character,
    );
    if (locations === undefined) {
      return {
        success: false,
        output: formatUnavailable("TypeScript language service is unavailable in this workspace."),
        error: "TypeScript language service unavailable.",
      };
    }
    return {
      success: true,
      output: truncateToolOutput(JSON.stringify({ definitions: locations }, null, 2)),
      data: { definitions: locations },
    };
  },
};

export const lspReferencesTool: Tool<LspPositionArgs> = {
  name: "lsp_references",
  description: "Find references to the symbol at line/character in a file.",
  riskLevel: "low",
  availableInModes: READ_TOOLS_MODES,
  schema: {
    name: "lsp_references",
    description: "Find references to the symbol at line/character in a file.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        line: { type: "number" },
        character: { type: "number" },
      },
      required: ["path", "line", "character"],
    },
  },
  async execute(args, context) {
    const locations = findReferences(
      context.workspaceRoot,
      args.path,
      args.line,
      args.character,
    );
    if (locations === undefined) {
      return {
        success: false,
        output: formatUnavailable("TypeScript language service is unavailable in this workspace."),
        error: "TypeScript language service unavailable.",
      };
    }
    return {
      success: true,
      output: truncateToolOutput(JSON.stringify({ references: locations }, null, 2)),
      data: { references: locations },
    };
  },
};
