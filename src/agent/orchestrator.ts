import type {
  AgentProfile,
  AgentResult,
  ModelProvider,
  UserTask,
} from "../shared/types.js";
import { AgentRuntime } from "./runtime.js";

export interface OrchestratorInput {
  task: UserTask;
  profile: AgentProfile;
  model: ModelProvider;
  resumeSessionId?: string;
}

export class AgentOrchestrator {
  constructor(private readonly runtime: AgentRuntime = new AgentRuntime()) {}

  async run(input: OrchestratorInput): Promise<AgentResult> {
    return this.runtime.run(input);
  }
}
