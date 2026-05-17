import { OpenAICompatibleProvider } from "./openai-compatible.js";

export const DEFAULT_LOCAL_BASE_URL = "http://127.0.0.1:11434/v1";
export const DEFAULT_LOCAL_API_KEY = "ollama";

export class LocalModelProvider extends OpenAICompatibleProvider {}
