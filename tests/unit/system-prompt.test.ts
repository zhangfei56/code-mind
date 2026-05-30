import assert from "node:assert/strict";
import { createRuntimeSystemPrompt } from "@code-mind/context";

export function runSystemPromptTests(): void {
  const prompt = createRuntimeSystemPrompt("You are a code agent.", {
    modelName: "local:demo",
    workspaceRoot: "/tmp/ws",
    cwd: "/tmp/ws",
  });

  assert.match(prompt, /You are a code agent\./);
  assert.match(prompt, /当前模型：local:demo/);
  assert.match(prompt, /Workspace root：\/tmp\/ws/);
  assert.match(prompt, /\*\*\* Begin Patch/);
  assert.match(prompt, /不要生成或尝试任何 workspace 外的绝对路径/);
}
