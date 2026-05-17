import { OpenAICompatibleProvider } from "./openai-compatible.js";

export const DEFAULT_QWEN_BASE_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1";
export const DEFAULT_QWEN_MODEL = "qwen3-coder-plus";

export class QwenProvider extends OpenAICompatibleProvider {}
