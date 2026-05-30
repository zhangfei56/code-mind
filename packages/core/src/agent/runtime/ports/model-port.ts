import type {
  AgentEventInput,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  RuntimeInput,
} from "@code-mind/shared";
import type { ModelPort } from "../../kernel/ports.js";
import {
  modelContentDeltaEvent,
  modelReasoningDeltaEvent,
} from "../agent-events.js";

export interface ModelInvokeContext {
  publish: (
    input: RuntimeInput | undefined,
    event: AgentEventInput,
  ) => Promise<void>;
  input: RuntimeInput | undefined;
  step: number;
  streamContent: boolean;
}

export type RuntimeModelPort = ModelPort & {
  invoke(
    request: ModelRequest,
    context: ModelInvokeContext,
  ): Promise<{ response: ModelResponse; streamed: boolean }>;
};

export function createModelPort(model: ModelProvider): RuntimeModelPort {
  return {
    call(request: ModelRequest): Promise<ModelResponse> {
      return model.chat(request);
    },
    async invoke(
      request: ModelRequest,
      context: ModelInvokeContext,
    ): Promise<{ response: ModelResponse; streamed: boolean }> {
      const { publish, input, step, streamContent } = context;
      if (typeof model.stream !== "function") {
        return { response: await model.chat(request), streamed: false };
      }

      let reasoningLength = 0;
      let contentLength = 0;
      let response: ModelResponse | undefined;

      for await (const event of model.stream(request)) {
        switch (event.type) {
          case "reasoning_delta":
            reasoningLength += event.delta.length;
            await publish(
              input,
              modelReasoningDeltaEvent(step, event.delta, reasoningLength),
            );
            break;
          case "content_delta":
            contentLength += event.delta.length;
            await publish(
              input,
              modelContentDeltaEvent(step, event.delta, contentLength),
            );
            break;
          case "done":
            response = event.response;
            break;
          case "error":
            throw event.error instanceof Error ? event.error : new Error(String(event.error));
          default:
            break;
        }
      }

      if (!response) {
        throw new Error("Model stream ended without a final response.");
      }

      return { response, streamed: streamContent && contentLength > 0 };
    },
  };
}

export function createModelPortFactory(): (model: ModelProvider) => RuntimeModelPort {
  return (model) => createModelPort(model);
}
