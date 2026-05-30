export class AgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentError";
  }
}

export class ValidationError extends AgentError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
