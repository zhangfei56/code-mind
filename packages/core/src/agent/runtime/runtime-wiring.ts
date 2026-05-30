import type { ContextManager } from "@code-mind/shared";
import type { ExtensionRegistry, SubagentManager } from "@code-mind/capabilities";
import type { ToolRegistry } from "@code-mind/execution";
import type { SessionStorePort } from "./ports/session-store-port.js";
import { ResultBuilder } from "../result-builder.js";
import { publish } from "./agent-events.js";
import type { SessionInitDeps } from "./session-init.js";
import type { SessionLifecycleDeps } from "./session-lifecycle.js";
import {
  createStaticRuntimePorts,
  type StaticRuntimePorts,
} from "./ports/index.js";
import {
  createDefaultRuntimeDependencies,
  createDefaultToolExecutor,
} from "./default-runtime-deps.js";
import type { RuntimeDependencies } from "./types.js";
import { setSessionStatus } from "./session-status.js";
import { AgentLoopController } from "./agent-loop-controller.js";

/** Resolved runtime graph for one AgentLoopController instance (pre-run / static). */
export interface AgentLoopRuntimeWiring {
  contextManager: ContextManager;
  sessionStoreFactory: (workspaceRoot: string) => SessionStorePort;
  resultBuilder: ResultBuilder;
  lifecycle: SessionLifecycleDeps;
  sessionInit: SessionInitDeps;
  staticPorts: StaticRuntimePorts;
  toolRegistry: ToolRegistry;
  extensionRegistry?: ExtensionRegistry;
  subagentManager?: SubagentManager;
}

export function createAgentLoopRuntimeWiring(
  dependencies: RuntimeDependencies = {},
): AgentLoopRuntimeWiring {
  const deps = createDefaultRuntimeDependencies(dependencies);
  const contextManager = deps.contextManager;
  const toolExecutor = createDefaultToolExecutor(deps);
  const resultBuilder = new ResultBuilder();

  const staticPorts = createStaticRuntimePorts({
    permissionEngine: deps.permissionEngine,
    safetyGuard: deps.safetyGuard,
    ...(deps.permissionPrompter === undefined
      ? {}
      : { permissionPrompter: deps.permissionPrompter }),
    toolExecutor,
    contextManager,
    verificationPipeline: deps.verificationPipeline,
    reviewEngine: deps.reviewEngine,
  });

  const lifecycle: SessionLifecycleDeps = {
    hookSystem: deps.hookSystem,
    review: staticPorts.review,
    publish: (input, event) => publish(input, event),
    setSessionStatus,
  };

  const sessionInit: SessionInitDeps = {
    lifecycle,
    setSessionStatus,
    publish: (input, event) => publish(input, event),
  };

  return {
    contextManager,
    sessionStoreFactory: deps.sessionStoreFactory,
    resultBuilder,
    lifecycle,
    sessionInit,
    staticPorts,
    toolRegistry: deps.toolRegistry,
    ...(deps.extensionRegistry === undefined
      ? {}
      : { extensionRegistry: deps.extensionRegistry }),
    ...(deps.subagentManager === undefined
      ? {}
      : { subagentManager: deps.subagentManager }),
  };
}

export function createAgentLoopController(
  dependencies: RuntimeDependencies = {},
): AgentLoopController {
  return new AgentLoopController(createAgentLoopRuntimeWiring(dependencies));
}
