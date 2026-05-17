import type { AgentResult } from "../shared/types.js";

export class ResultBuilder {
  success(
    sessionId: string,
    modelName: string,
    steps: number,
    text: string,
  ): AgentResult {
    return {
      sessionId,
      status: "success",
      finalText: text,
      steps,
      modelName,
      summary: text,
    };
  }

  stoppedByLimit(
    sessionId: string,
    modelName: string,
    steps: number,
  ): AgentResult {
    const finalText = "Stopped because max steps limit was reached.";
    return {
      sessionId,
      status: "stopped_by_limit",
      finalText,
      steps,
      modelName,
      summary: finalText,
    };
  }

  permissionDenied(
    sessionId: string,
    modelName: string,
    steps: number,
    text: string,
  ): AgentResult {
    return {
      sessionId,
      status: "permission_denied",
      finalText: text,
      steps,
      modelName,
      summary: text,
    };
  }

  userRejected(
    sessionId: string,
    modelName: string,
    steps: number,
    text: string,
  ): AgentResult {
    return {
      sessionId,
      status: "user_rejected",
      finalText: text,
      steps,
      modelName,
      summary: text,
    };
  }

  failed(
    sessionId: string,
    modelName: string,
    steps: number,
    text: string,
  ): AgentResult {
    return {
      sessionId,
      status: "failed",
      finalText: text,
      steps,
      modelName,
      summary: text,
    };
  }
}
