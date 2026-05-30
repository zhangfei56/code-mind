import type {
  AgentEventInput,
  AgentResult,
  AgentSession,
  ModelProvider,
  RuntimeInput,
} from "@code-mind/shared";
import type { ContextManager } from "@code-mind/shared";
import type { ToolExecutor } from "@code-mind/execution";
import type { PermissionEngine, SafetyGuard } from "@code-mind/security";
import type { SessionStorePort } from "./session-store-port.js";
import type { ReviewEngine, VerificationPipeline } from "@code-mind/verify";
import type { RunKernelPorts, PromptAssemblyPort, ObservationPort } from "../../kernel/ports.js";
import { serializeRunState } from "../run-state-persistence.js";
import type { RunState } from "../run-state.js";
import type { PermissionPrompter } from "../types.js";
import { createHumanApprovalPort, type HumanApprovalPortAdapter } from "./human-approval-port.js";
import { createModelPort, createModelPortFactory, type RuntimeModelPort } from "./model-port.js";
import { createObservationPortFactory } from "./observation-port.js";
import { createPermissionPort } from "./permission-port.js";
import { createPromptAssemblyPortFactory } from "./prompt-assembly-port.js";
import { createReviewPort } from "./review-port.js";
import { createToolExecutionPort } from "./tool-execution-port.js";
import { createVerificationPort } from "./verification-port.js";

export { createHumanApprovalPort, type HumanApprovalPortAdapter } from "./human-approval-port.js";
export { createModelPort, createModelPortFactory, type RuntimeModelPort } from "./model-port.js";
export { createObservationPort, createObservationPortFactory } from "./observation-port.js";
export { createPermissionPort } from "./permission-port.js";
export {
  createPromptAssemblyPort,
  createPromptAssemblyPortFactory,
} from "./prompt-assembly-port.js";
export { createReviewPort } from "./review-port.js";
export { createToolExecutionPort } from "./tool-execution-port.js";
export { createVerificationPort } from "./verification-port.js";
export {
  createSessionStorePort,
  type SessionStorePort,
} from "./session-store-port.js";

/** Ports constructed once per AgentLoopController (no session/run scope). */
export interface StaticRuntimePorts {
  permission: RunKernelPorts["permission"];
  humanApproval: HumanApprovalPortAdapter;
  tools: RunKernelPorts["tools"];
  verification: RunKernelPorts["verification"];
  review: RunKernelPorts["review"];
  promptAssemblyFactory: (session: AgentSession) => PromptAssemblyPort;
  observationFactory: (session: AgentSession) => ObservationPort;
  modelPortFactory: (model: import("@code-mind/shared").ModelProvider) => RuntimeModelPort;
}

export function createStaticRuntimePorts(params: {
  permissionEngine: PermissionEngine;
  safetyGuard: SafetyGuard;
  permissionPrompter?: PermissionPrompter;
  toolExecutor: ToolExecutor;
  contextManager: ContextManager;
  verificationPipeline: VerificationPipeline;
  reviewEngine: ReviewEngine;
}): StaticRuntimePorts {
  return {
    permission: createPermissionPort(params),
    humanApproval: createHumanApprovalPort(params),
    tools: createToolExecutionPort(params.toolExecutor),
    verification: createVerificationPort(params.verificationPipeline),
    review: createReviewPort(params.reviewEngine),
    promptAssemblyFactory: createPromptAssemblyPortFactory(params.contextManager),
    observationFactory: createObservationPortFactory(params.contextManager),
    modelPortFactory: createModelPortFactory(),
  };
}

export function createRunScopedKernelPorts(params: {
  staticPorts: StaticRuntimePorts;
  session: AgentSession;
  model: ModelProvider;
  sessionStore: SessionStorePort;
  input: RuntimeInput | undefined;
  publish: (
    input: RuntimeInput | undefined,
    event: AgentEventInput,
  ) => Promise<void>;
  finalize: (result: AgentResult, runState: RunState) => AgentResult;
}): RunKernelPorts {
  const { staticPorts, session, model, sessionStore, input, publish, finalize } = params;
  return {
    promptAssembly: staticPorts.promptAssemblyFactory(session),
    model: createModelPort(model),
    permission: staticPorts.permission,
    tools: staticPorts.tools,
    humanApproval: staticPorts.humanApproval,
    stateStore: {
      checkpoint: async (runState, _reason) => {
        await sessionStore.saveRunState(session.id, serializeRunState(runState));
      },
    },
    events: {
      publish: async (event) => {
        await publish(input, event);
      },
    },
    completion: {
      finalize,
    },
    observation: staticPorts.observationFactory(session),
    verification: staticPorts.verification,
    review: staticPorts.review,
  };
}
