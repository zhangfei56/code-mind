# Product-layer prompts (code-mind)

Editable copy for workspace rules, mode policy, permissions, and locale-specific runtime text.

Files use `{{variable}}` placeholders filled at runtime.

Locale routing (`zh` vs `en`) is in `product-prompt.ts` — typically Chinese for deepseek/qwen/kimi/local, English for gpt/claude/gemini.

OpenCode model-family prompts live in the parent `prompts/` directory.
