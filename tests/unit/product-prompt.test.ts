import assert from "node:assert/strict";
import {
  getProductPrompt,
  renderPromptTemplate,
  resolveProductPromptLocale,
} from "@code-mind/models";

export function runProductPromptTests(): void {
  assert.equal(resolveProductPromptLocale("deepseek"), "zh");
  assert.equal(resolveProductPromptLocale("qwen", "qwen-plus"), "zh");
  assert.equal(resolveProductPromptLocale("gpt-4o"), "en");
  assert.equal(resolveProductPromptLocale("anthropic", "claude-sonnet-4"), "en");
  assert.equal(resolveProductPromptLocale("google", "gemini-2.5-pro"), "en");

  const rendered = renderPromptTemplate("mode={{mode}} cwd={{cwd}}", {
    mode: "agent",
    cwd: "/tmp/ws",
  });
  assert.equal(rendered, "mode=agent cwd=/tmp/ws");

  const runtimeZh = getProductPrompt("runtime", "zh");
  assert.match(runtimeZh, /Workspace 规则：/);
  assert.doesNotMatch(runtimeZh, /环境信息：/);

  const runtimeEn = getProductPrompt("runtime", "en");
  assert.match(runtimeEn, /Workspace rules:/);

  const envZh = getProductPrompt("env", "zh", {
    modelName: "deepseek",
    modelId: "deepseek",
    cwd: "/tmp/ws",
    workspaceRoot: "/tmp/ws",
    isGitRepo: "no",
    platform: "darwin",
    date: "2026-01-01",
  });
  assert.match(envZh, /你当前使用的模型是 deepseek/);
  assert.match(envZh, /工作目录：\/tmp\/ws/);
}
