import assert from "node:assert/strict";
import { PermissionEngine, SafetyGuard } from "@code-mind/security";
import {
  createHumanApprovalPort,
  createModelPort,
  createPermissionPort,
  createPromptAssemblyPort,
  createRunScopedKernelPorts,
  createRunState,
  createStaticRuntimePorts,
  createToolExecutionPort,
} from "@code-mind/core";
import { ToolRegistry, ToolExecutor, registerDefaultTools } from "@code-mind/execution";
import { DefaultContextManager } from "@code-mind/context";
import type { AgentSession, UserTask } from "@code-mind/shared";

export async function runRuntimePortsTests(): Promise<void> {
  const permissionPort = createPermissionPort({
    permissionEngine: new PermissionEngine(),
    safetyGuard: new SafetyGuard(),
  });
  const decision = await permissionPort.check({
    toolCall: {
      id: "call_1",
      name: "read_file",
      arguments: { path: "README.md" },
    },
    mode: "ask",
    workspaceRoot: process.cwd(),
  });
  assert.ok(["allow", "ask", "deny"].includes(decision.type));

  const humanApproval = createHumanApprovalPort({});
  const denied = await humanApproval.resolve(
    "session_1",
    {
      id: "call_1",
      name: "run_shell",
      arguments: { command: "rm -rf /" },
    },
    { type: "deny", reason: "blocked" },
  );
  assert.equal(denied.allowed, false);

  const registry = new ToolRegistry();
  registerDefaultTools(registry);
  const tools = createToolExecutionPort(new ToolExecutor(registry));
  const readResult = await tools.execute(
    { id: "call_2", name: "list_dir", arguments: { path: "." } },
    {
      sessionId: "session_1",
      workspaceRoot: process.cwd(),
      cwd: process.cwd(),
      mode: "ask",
    },
  );
  assert.equal(readResult.success, true);

  const task: UserTask = {
    id: "task_1",
    text: "hello",
    cwd: process.cwd(),
    mode: "ask",
    maxSteps: 3,
  };
  const session: AgentSession = {
    id: "session_1",
    task,
    workspaceRoot: process.cwd(),
    profile: { id: "default", name: "Default", systemPrompt: "test" },
    modelName: "fake",
    messages: [],
    observations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const promptAssembly = createPromptAssemblyPort(new DefaultContextManager(), session);
  const snapshot = await promptAssembly.assemble(
    {
      task,
      profile: session.profile,
      model: {
        name: "fake",
        chat: async () => ({ text: "", finishReason: "stop", raw: {}, toolCalls: [] }),
        getCapabilities: () => ({
          toolCall: false,
          parallelToolCall: false,
          jsonSchema: false,
          vision: false,
          reasoning: false,
          maxContextTokens: 1,
          maxOutputTokens: 1,
          supportsPromptCache: false,
          supportsComputerUse: false,
        }),
      },
    },
    createRunState(task),
  );
  assert.ok(snapshot.messages.length > 0);

  const streamedEvents: string[] = [];
  const streamingModel = {
    name: "stream-fake",
    chat: async () => ({ text: "fallback", finishReason: "stop", raw: {}, toolCalls: [] }),
    getCapabilities: () => ({
      toolCall: false,
      parallelToolCall: false,
      jsonSchema: false,
      vision: false,
      reasoning: false,
      maxContextTokens: 1,
      maxOutputTokens: 1,
      supportsPromptCache: false,
      supportsComputerUse: false,
    }),
    async *stream() {
      streamedEvents.push("reasoning_delta");
      yield { type: "reasoning_delta" as const, delta: "think" };
      streamedEvents.push("content_delta");
      yield { type: "content_delta" as const, delta: "hello" };
      streamedEvents.push("done");
      yield {
        type: "done" as const,
        response: {
          text: "hello",
          finishReason: "stop" as const,
          raw: {},
          toolCalls: [],
        },
      };
    },
  };
  const modelPort = createModelPort(streamingModel);
  const invokeResult = await modelPort.invoke(
    { messages: [{ id: "m1", role: "user", content: "hi", createdAt: new Date().toISOString() }], tools: [] },
    {
      publish: async (_input, event) => {
        streamedEvents.push("kind" in event ? String(event.kind) : String((event as { type?: string }).type));
      },
      input: undefined,
      step: 1,
      streamContent: true,
    },
  );
  assert.equal(invokeResult.response.text, "hello");
  assert.equal(invokeResult.streamed, true);
  assert.ok(streamedEvents.includes("model.reasoning.delta"));
  assert.ok(streamedEvents.includes("model.content.delta"));

  const staticPorts = createStaticRuntimePorts({
    permissionEngine: new PermissionEngine(),
    safetyGuard: new SafetyGuard(),
    toolExecutor: new ToolExecutor(registry),
    contextManager: new DefaultContextManager(),
    verificationPipeline: { run: async () => ({ passed: true, summary: "ok", steps: [] }) } as never,
    reviewEngine: {
      review: () => ({
        passed: true,
        issues: [],
        suggestions: [],
        requiresAnotherIteration: false,
      }),
    } as never,
  });
  let factoryUsed = false;
  staticPorts.modelPortFactory = () => {
    factoryUsed = true;
    return {
      call: async () => ({
        text: "from factory",
        finishReason: "stop",
        raw: {},
        toolCalls: [],
      }),
      invoke: async () => ({
        streamed: false,
        response: {
          text: "from factory",
          finishReason: "stop",
          raw: {},
          toolCalls: [],
        },
      }),
    };
  };
  const runPorts = createRunScopedKernelPorts({
    staticPorts,
    session,
    model: streamingModel,
    sessionStore: {
      create: async () => session,
      restoreSession: async () => session,
      updateManifest: async () => ({
        id: session.id,
        projectPath: session.workspaceRoot,
        task: session.task.text,
        mode: session.task.mode,
        status: "running",
        model: session.modelName,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }),
      readManifest: async () => ({
        id: session.id,
        projectPath: session.workspaceRoot,
        task: session.task.text,
        mode: session.task.mode,
        status: "running",
        model: session.modelName,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }),
      saveCurrentSummary: async () => {},
      saveSummary: async () => {},
      savePlan: async () => {},
      writeSessionTextFile: async () => {},
      readPlan: async () => undefined,
      saveCompactSummary: async () => "compact.md",
      saveReview: async () => {},
      saveVerification: async () => {},
      readVerification: async () => undefined,
      saveRunState: async () => {},
      readRunState: async () => undefined,
      saveWorktree: async () => {},
      readWorktree: async () => undefined,
      listSessionManifests: async () => [],
      saveApproval: async () => {},
      listApprovals: async () => [],
      getPendingApprovals: async () => [],
      recordModelUsage: async () => ({
        id: session.id,
        projectPath: session.workspaceRoot,
        task: session.task.text,
        mode: session.task.mode,
        status: "running",
        model: session.modelName,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }),
      recordCompaction: async () => {},
      mergeRunUsageSummary: async () => ({
        id: session.id,
        projectPath: session.workspaceRoot,
        task: session.task.text,
        mode: session.task.mode,
        status: "running",
        model: session.modelName,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }),
      getSessionDir: () => process.cwd(),
    },
    input: undefined,
    publish: async () => {},
    finalize: (result) => result,
  });
  const factoryResponse = await runPorts.model.call({
    messages: [],
    tools: [],
  });
  assert.equal(factoryUsed, true);
  assert.equal(factoryResponse.text, "from factory");
}
