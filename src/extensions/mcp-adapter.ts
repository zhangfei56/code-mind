import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Tool, ToolSchema, ToolResult, ToolContext, McpServerConfig } from "../shared/types.js";
import { truncateToolOutput } from "../tools/output.js";

export interface McpToolDescriptor {
  serverName: string;
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface McpProtocolRequest {
  id: string;
  type: "list_tools" | "call_tool";
  tool?: string;
  arguments?: Record<string, unknown>;
}

interface McpProtocolResponse {
  id: string;
  ok: boolean;
  tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
  result?: unknown;
  error?: string;
}

function createInternalMcpName(serverName: string, toolName: string): string {
  return `mcp__${serverName}__${toolName}`;
}

function parseInternalMcpName(name: string): { serverName: string; toolName: string } {
  const match = name.match(/^mcp__([^_]+)__(.+)$/);
  if (!match) {
    throw new Error(`Invalid MCP tool name: ${name}`);
  }
  return {
    serverName: match[1] ?? "",
    toolName: match[2] ?? "",
  };
}

function toInternalToolSchema(descriptor: McpToolDescriptor): ToolSchema {
  return {
    name: createInternalMcpName(descriptor.serverName, descriptor.toolName),
    description: descriptor.description,
    inputSchema: descriptor.inputSchema,
  };
}

class McpClient {
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly buffer: McpProtocolResponse[] = [];

  constructor(config: McpServerConfig, cwd: string) {
    if (config.transport !== "stdio" || !config.command) {
      throw new Error("Only stdio MCP servers are supported in Phase 5.");
    }

    this.process = spawn(config.command, config.args ?? [], {
      cwd,
      env: {
        ...process.env,
        ...(config.env ?? {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.process.stdout.setEncoding("utf8");
    let partial = "";
    this.process.stdout.on("data", (chunk: string) => {
      partial += chunk;
      const lines = partial.split("\n");
      partial = lines.pop() ?? "";
      for (const line of lines.filter(Boolean)) {
        this.buffer.push(JSON.parse(line) as McpProtocolResponse);
      }
    });
  }

  async send(request: McpProtocolRequest): Promise<McpProtocolResponse> {
    this.process.stdin.write(`${JSON.stringify(request)}\n`);
    const startedAt = Date.now();
    while (Date.now() - startedAt < 5_000) {
      const index = this.buffer.findIndex((item) => item.id === request.id);
      if (index >= 0) {
        const [response] = this.buffer.splice(index, 1);
        if (!response) {
          throw new Error("MCP response missing from buffer.");
        }
        return response;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Timed out waiting for MCP response.");
  }

  dispose(): void {
    this.process.kill();
  }
}

export class McpAdapter {
  private readonly clients = new Map<string, McpClient>();

  async listTools(
    serverName: string,
    config: McpServerConfig,
    cwd: string,
  ): Promise<Tool[]> {
    const client = this.getClient(serverName, config, cwd);
    const response = await client.send({
      id: `list_${Date.now()}`,
      type: "list_tools",
    });
    if (!response.ok || !response.tools) {
      throw new Error(response.error ?? `Failed to list tools for MCP server ${serverName}.`);
    }
    return response.tools.map((tool) =>
      this.createTool(
        serverName,
        {
          serverName,
          toolName: tool.name,
          description: tool.description ?? tool.name,
          inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
        },
        client,
      ),
    );
  }

  async callTool(
    toolName: string,
    arguments_: Record<string, unknown>,
    context: ToolContext,
    config: McpServerConfig,
  ): Promise<ToolResult> {
    const { serverName, toolName: rawToolName } = parseInternalMcpName(toolName);
    const client = this.getClient(serverName, config, context.workspaceRoot);
    const response = await client.send({
      id: `call_${Date.now()}`,
      type: "call_tool",
      tool: rawToolName,
      arguments: arguments_,
    });
    if (!response.ok) {
      return {
        success: false,
        output: "",
        error: response.error ?? "MCP call failed",
      };
    }
    return {
      success: true,
      output: truncateToolOutput(JSON.stringify(response.result, null, 2)),
      data: response.result,
    };
  }

  private createTool(
    serverName: string,
    descriptor: McpToolDescriptor,
    client: McpClient,
  ): Tool<Record<string, unknown>> {
    return {
      name: createInternalMcpName(serverName, descriptor.toolName),
      description: descriptor.description,
      schema: toInternalToolSchema(descriptor),
      riskLevel: /delete|drop|update/i.test(descriptor.toolName)
        ? "critical"
        : /create|click|query/i.test(descriptor.toolName)
          ? "high"
          : "low",
      execute: async (args) => {
        const response = await client.send({
          id: `call_${Date.now()}`,
          type: "call_tool",
          tool: descriptor.toolName,
          arguments: args,
        });
        return response.ok
          ? {
              success: true,
              output: truncateToolOutput(JSON.stringify(response.result, null, 2)),
              data: response.result,
            }
          : {
              success: false,
              output: "",
              error: response.error ?? "MCP call failed",
            };
      },
    };
  }

  private getClient(serverName: string, config: McpServerConfig, cwd: string): McpClient {
    const existing = this.clients.get(serverName);
    if (existing) {
      return existing;
    }
    const client = new McpClient(config, cwd);
    this.clients.set(serverName, client);
    return client;
  }

  dispose(): void {
    for (const client of this.clients.values()) {
      client.dispose();
    }
    this.clients.clear();
  }
}
