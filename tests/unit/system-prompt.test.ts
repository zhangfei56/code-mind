import assert from "node:assert/strict";
import { createRuntimeSystemPrompt } from "@code-mind/context";

export function runSystemPromptTests(): void {
  const prompt = createRuntimeSystemPrompt("You are a code agent.", {
    modelName: "deepseek",
    workspaceRoot: "/tmp/ws",
    cwd: "/tmp/ws",
    locale: "zh",
  });

  assert.match(prompt, /You are a code agent\./);
  assert.match(prompt, /Workspace 规则：/);
  assert.match(prompt, /apply_patch/);
  assert.doesNotMatch(prompt, /\*\*\* Begin Patch/);
  assert.match(prompt, /不要生成或尝试任何 workspace 外的绝对路径/);
  assert.doesNotMatch(prompt, /环境信息：/);
  assert.doesNotMatch(prompt, /当前模型：/);
}
