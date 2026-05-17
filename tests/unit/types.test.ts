import assert from "node:assert/strict";
import type {
  AgentResult,
  PermissionDecision,
  ToolCall,
  ToolResult,
} from "../../src/shared/types.js";

export function runTypeContractTests(): void {
  const decision: PermissionDecision = {
    type: "ask",
    reason: "needs approval",
  };
  assert.equal(decision.type, "ask");

  const toolCall: ToolCall = {
    id: "call_1",
    name: "read_file",
    arguments: { path: "package.json" },
  };

  const toolResult: ToolResult = {
    success: true,
    output: "package.json contents",
  };

  const result: AgentResult = {
    sessionId: "session_1",
    status: "success",
    finalText: "done",
    steps: 1,
    modelName: "local",
  };

  assert.equal(toolCall.name, "read_file");
  assert.equal(toolResult.success, true);
  assert.equal(result.status, "success");
}
