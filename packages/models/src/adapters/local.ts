import { OpenAICompatibleProvider } from "./openai-compatible.js";
export {
  DEFAULT_LOCAL_API_KEY,
  DEFAULT_LOCAL_BASE_URL,
} from "@code-mind/config";

export class LocalModelProvider extends OpenAICompatibleProvider {}
