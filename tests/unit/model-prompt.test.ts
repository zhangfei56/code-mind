import assert from "node:assert/strict";
import {
  getModelSpecificPrompt,
  resolveModelPromptKey,
} from "@code-mind/models";

const CONFLICTING_PATTERNS = [
  /\bTodoWrite\b/i,
  /\bWebFetch\b/i,
  /\bwebfetch\b/i,
  /\bmulti_tool_use\.parallel\b/i,
  /\bquestion tool\b/i,
  /\bctrl\+p\b/i,
  /\bopencode\.ai\b/i,
  /\bRead for reading\b/i,
  /\bUse Read to view\b/i,
  /\bTask tool\b/i,
  /\bthe `task` tool\b/i,
  /\bmemory\.instruction\.md\b/i,
  /\bsequential thinking tool\b/i,
];

export async function runModelPromptTests(): Promise<void> {
  assert.equal(resolveModelPromptKey("deepseek"), "default");
  assert.equal(resolveModelPromptKey("qwen", "qwen-plus"), "default");
  assert.equal(resolveModelPromptKey("gpt-4o"), "beast");
  assert.equal(resolveModelPromptKey("openai", "gpt-4.1"), "beast");
  assert.equal(resolveModelPromptKey("opencode", "gpt-5.1-codex"), "codex");
  assert.equal(resolveModelPromptKey("anthropic", "claude-sonnet-4"), "anthropic");
  assert.equal(resolveModelPromptKey("google", "gemini-2.5-pro"), "gemini");
  assert.equal(resolveModelPromptKey("moonshot", "kimi-k2"), "kimi");

  const families = [
    "deepseek",
    "gpt-4o",
    "gpt-3.5-turbo",
    "gpt-5.1-codex",
    "claude-3-5-sonnet",
    "gemini-2.5-pro",
    "kimi-k2",
  ] as const;

  for (const model of families) {
    const prompt = getModelSpecificPrompt(model);
    assert.match(prompt, /code-mind/i);
    for (const pattern of CONFLICTING_PATTERNS) {
      assert.doesNotMatch(prompt, pattern, `${model} prompt must not match ${pattern}`);
    }
  }

  const deepseekPrompt = getModelSpecificPrompt("deepseek");
  assert.match(deepseekPrompt, /software engineering tasks/i);
  assert.match(deepseekPrompt, /tools schema/i);

  const gptPrompt = getModelSpecificPrompt("gpt-3.5-turbo");
  assert.match(gptPrompt, /pragmatic/i);

  const beastPrompt = getModelSpecificPrompt("gpt-4o");
  assert.match(beastPrompt, /Keep going until the user/i);

  const anthropicPrompt = getModelSpecificPrompt("claude-3-5-sonnet");
  assert.match(anthropicPrompt, /read_file/);
  assert.doesNotMatch(anthropicPrompt, /TodoWrite/i);
}
