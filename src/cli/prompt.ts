import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { AgentProfile, ToolCall } from "../shared/types.js";

export function createDefaultProfile(): AgentProfile {
  return {
    id: "default-code-agent",
    name: "Default Code Agent",
    systemPrompt: [
      "你是一个代码 Agent。",
      "你可以读取文件、搜索代码、应用 patch、运行测试。",
      "不要猜测文件内容，必须先读取文件。",
      "敏感文件不能读取。",
      "修改代码后应运行相关测试。",
      "如果需要修改文件，优先使用 apply_patch。",
    ].join("\n"),
  };
}

export async function confirmToolCall(
  toolCall: ToolCall,
  reason: string,
): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(
      `${reason}\nApprove tool ${toolCall.name} with arguments ${JSON.stringify(toolCall.arguments)}? [y/N] `,
    );
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
