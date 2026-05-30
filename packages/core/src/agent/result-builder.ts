import type { AgentResult } from "@code-mind/shared";

export class ResultBuilder {
  success(
    sessionId: string,
    modelName: string,
    steps: number,
    text: string,
  ): AgentResult {
    return {
      sessionId,
      runId: "",
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
    const finalText = [
      `Stopped after ${steps} steps because the max steps limit was reached.`,
      "The run was still in progress when the limit was hit.",
      "Try increasing /max-steps or narrowing the request scope.",
    ].join(" ");
    return {
      sessionId,
      runId: "",
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
      runId: "",
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
      runId: "",
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
      runId: "",
      status: "failed",
      finalText: text,
      steps,
      modelName,
      summary: text,
    };
  }

  cancelled(
    sessionId: string,
    modelName: string,
    steps: number,
    text = "Cancelled by user.",
  ): AgentResult {
    return {
      sessionId,
      runId: "",
      status: "cancelled",
      finalText: text,
      steps,
      modelName,
      summary: text,
    };
  }

  incomplete(
    sessionId: string,
    modelName: string,
    steps: number,
    text: string,
  ): AgentResult {
    return {
      sessionId,
      runId: "",
      status: "incomplete",
      finalText: text,
      steps,
      modelName,
      summary: text,
    };
  }
}
