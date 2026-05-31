# Model-family prompts (code-mind)

These files supply **model-family behavior** (tone, persistence, engineering habits). They are adapted from OpenCode but **must not** reference OpenCode-only tools or product features.

## Ground truth for tools

Tool names, parameters, and mode visibility come from:

1. `ToolRegistry` / `ModelRequest.tools` (JSON schema)
2. Product prompts under `product/` (runtime rules, subagent policy)

Do **not** document Read/Edit/Bash/Task/TodoWrite/WebFetch/ls/question tools here.

## Files

| File | Routed for |
|------|------------|
| default.txt | deepseek, qwen, most local models |
| beast.txt | gpt-4, o1, o3 |
| codex.txt | gpt + codex |
| gpt.txt | other gpt |
| anthropic.txt | claude |
| gemini.txt | gemini-* |
| kimi.txt | kimi |
| trinity.txt | trinity |

Attribution: derived from [OpenCode](https://github.com/anomalyco/opencode) prompts, trimmed for code-mind.
