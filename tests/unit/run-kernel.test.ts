import { strict as assert } from "node:assert";
import {
  applyRunKernelEventAndCheckpoint,
  assertRunKernelInvariants,
  canAcceptToolCallsHandled,
  createRunKernelState,
  createRunScopedKernelPorts,
  createRunState,
  createStaticRuntimePorts,
  dispatchRunKernelCommands,
  expectRunKernelCommand,
  isRunKernelCommand,
  primaryRunKernelCommand,
  transitionRunKernel,
  transitionRunKernelState,
} from "@code-mind/core";
import type { ToolCall } from "@code-mind/shared";
import { PermissionEngine, SafetyGuard } from "@code-mind/security";
import { ToolRegistry, ToolExecutor, registerDefaultTools } from "@code-mind/execution";
import { DefaultContextManager } from "@code-mind/context";
import { ReviewEngine, VerificationPipeline } from "@code-mind/verify";

export async function runRunKernelTests(): Promise<void> {
  const started = transitionRunKernelState(
    createRunKernelState({ maxSteps: 3 }),
    {
      type: "step_started",
      step: 1,
      maxSteps: 3,
      closingTurn: false,
    },
  );

  assert.equal(started.state.phase, "assembling_prompt");
  assert.equal(started.state.step, 1);
  assert.deepEqual(
    started.commands.map((command) => command.type),
    ["checkpoint", "assemble_prompt"],
  );

  const promptReady = transitionRunKernelState(
    started.state,
    { type: "prompt_assembled" },
  );
  assert.equal(promptReady.state.phase, "calling_model");
  assert.deepEqual(
    promptReady.commands.map((command) => command.type),
    ["checkpoint", "call_model"],
  );

  const terminal = transitionRunKernel({
    type: "model_response_received",
    enterClosingTurn: true,
    response: {
      text: "done",
      toolCalls: [],
      finishReason: "stop",
    },
  });

  const completeCommand = expectRunKernelCommand(terminal, "complete_from_model");
  assert.equal(terminal.state.phase, "finalizing");
  assert.equal(terminal.state.closingTurn, true);
  assert.equal(completeCommand.responseText, "done");
  assert.equal(completeCommand.forceSummary, true);

  const toolCall = {
    id: "tool_1",
    name: "read_file",
    arguments: { path: "package.json" },
  } satisfies ToolCall;

  const routed = transitionRunKernel({
    type: "model_response_received",
    enterClosingTurn: false,
    response: {
      text: "",
      toolCalls: [toolCall],
      finishReason: "tool_call",
    },
  });

  const handleToolsCommand = expectRunKernelCommand(routed, "handle_tool_calls");
  assert.equal(routed.state.phase, "handling_tools");
  assert.equal(routed.state.pendingToolCalls, 1);
  assert.deepEqual(handleToolsCommand.toolCalls, [toolCall]);

  const afterTools = transitionRunKernelState(
    {
      ...routed.state,
      step: 1,
      maxSteps: 3,
    },
    { type: "tool_calls_handled" },
  );
  assert.equal(afterTools.state.phase, "assembling_prompt");
  assert.deepEqual(
    afterTools.commands.map((command) => command.type),
    ["checkpoint", "assemble_prompt"],
  );

  const afterLimit = transitionRunKernelState(
    {
      ...routed.state,
      step: 3,
      maxSteps: 3,
    },
    { type: "tool_calls_handled" },
  );
  assert.equal(afterLimit.state.phase, "finalizing");
  assert.deepEqual(
    afterLimit.commands.map((command) => command.type),
    ["checkpoint", "finalize"],
  );

  const approval = transitionRunKernelState(
    routed.state,
    { type: "approval_requested" },
  );
  assert.equal(approval.state.phase, "awaiting_approval");
  assert.equal(approval.commands[0]?.type, "checkpoint");

  const approved = transitionRunKernelState(
    approval.state,
    { type: "approval_resolved", approved: true },
  );
  assert.equal(approved.state.phase, "executing_tool");

  const denied = transitionRunKernelState(
    approval.state,
    { type: "approval_resolved", approved: false },
  );
  assert.equal(denied.state.phase, "recovering");

  const recovery = transitionRunKernelState(
    {
      ...terminal.state,
      closingTurn: true,
    },
    { type: "recovery_requested" },
  );
  assert.equal(recovery.state.phase, "recovering");
  assert.equal(recovery.state.closingTurn, false);
  assert.equal(expectRunKernelCommand(recovery, "assemble_prompt").type, "assemble_prompt");

  const recoveryFromTools = transitionRunKernelState(
    {
      ...routed.state,
      phase: "executing_tool",
      pendingToolCalls: 1,
    },
    { type: "recovery_requested" },
  );
  assert.equal(recoveryFromTools.state.phase, "recovering");
  assert.equal(expectRunKernelCommand(recoveryFromTools, "assemble_prompt").type, "assemble_prompt");
  assert.equal(canAcceptToolCallsHandled("executing_tool"), true);
  assert.equal(canAcceptToolCallsHandled("recovering"), false);
  assert.throws(
    () => transitionRunKernelState(recoveryFromTools.state, { type: "tool_calls_handled" }),
    /phase recovering cannot receive tool_calls_handled/,
  );

  const verifying = transitionRunKernelState(
    {
      ...createRunKernelState({ maxSteps: 3, phase: "executing_tool", step: 1 }),
      pendingToolCalls: 1,
    },
    { type: "verification_started" },
  );
  assert.equal(verifying.state.phase, "verifying");
  assert.equal(verifying.state.pendingToolCalls, 1);

  const verified = transitionRunKernelState(verifying.state, {
    type: "verification_finished",
    passed: true,
  });
  assert.equal(verified.state.phase, "executing_tool");

  const completed = transitionRunKernelState(
    {
      ...afterTools.state,
      phase: "finalizing",
    },
    { type: "run_completed" },
  );
  assert.equal(completed.state.phase, "completed");
  assert.equal(expectRunKernelCommand(completed, "finalize").type, "finalize");

  const finalizeCommand = expectRunKernelCommand(completed, "finalize");
  assert.equal(finalizeCommand.reason, "completed");
  assert.equal(isRunKernelCommand(completed, "finalize"), true);
  assert.equal(isRunKernelCommand(completed, "call_model"), false);
  assert.throws(
    () => expectRunKernelCommand(completed, "call_model"),
    /Expected run kernel command call_model but received finalize/,
  );

  assert.throws(
    () =>
      transitionRunKernelState(
        createRunKernelState({
          maxSteps: 3,
          phase: "routing_model_response",
          closingTurn: true,
        }),
        {
          type: "model_response_received",
          enterClosingTurn: true,
          response: {
            text: "",
            toolCalls: [toolCall],
            finishReason: "tool_call",
          },
        },
      ),
    /closing turn cannot request tools/,
  );

  assert.throws(
    () =>
      assertRunKernelInvariants(
        {
          ...createRunKernelState({ maxSteps: 3, phase: "assembling_prompt" }),
          pendingToolCalls: 1,
        },
        [{ type: "assemble_prompt" }],
      ),
    /pending tool calls require a tool phase/,
  );

  assert.throws(
    () =>
      assertRunKernelInvariants(
        createRunKernelState({ maxSteps: 3, phase: "handling_tools" }),
        [{ type: "handle_tool_calls", toolCalls: [] }],
      ),
    /tool handling phase requires pending tool calls/,
  );

  for (const phase of ["completed", "cancelled", "failed"] as const) {
    assert.throws(
      () =>
        assertRunKernelInvariants(
          createRunKernelState({ maxSteps: 3, phase }),
          [{ type: "assemble_prompt" }],
        ),
      /terminal runs cannot request more work/,
    );
  }

  assert.throws(
    () =>
      transitionRunKernelState(
        createRunKernelState({ maxSteps: 3, phase: "completed" }),
        {
          type: "step_started",
          step: 2,
          maxSteps: 3,
          closingTurn: false,
        },
      ),
    /terminal phase cannot receive step_started/,
  );

  assert.throws(
    () =>
      transitionRunKernelState(
        createRunKernelState({ maxSteps: 3, phase: "failed" }),
        { type: "prompt_assembled" },
      ),
    /terminal phase cannot receive prompt_assembled/,
  );

  assert.throws(
    () =>
      transitionRunKernelState(
        createRunKernelState({ maxSteps: 3, phase: "initializing" }),
        { type: "prompt_assembled" },
      ),
    /phase initializing cannot receive prompt_assembled/,
  );

  assert.throws(
    () =>
      transitionRunKernelState(
        createRunKernelState({ maxSteps: 3, phase: "assembling_prompt" }),
        {
          type: "model_response_received",
          enterClosingTurn: false,
          response: {
            text: "too early",
            toolCalls: [],
            finishReason: "stop",
          },
        },
      ),
    /phase assembling_prompt cannot receive model_response_received/,
  );

  assert.throws(
    () =>
      transitionRunKernelState(
        {
          ...createRunKernelState({ maxSteps: 3, phase: "handling_tools" }),
          pendingToolCalls: 1,
        },
        { type: "approval_resolved", approved: true },
      ),
    /phase handling_tools cannot receive approval_resolved/,
  );

  const dispatched: string[] = [];
  const dispatchedResults = await dispatchRunKernelCommands(completed, {
    finalize: async (command) => {
      dispatched.push(`${command.type}:${command.reason}`);
      return command.reason;
    },
  });
  assert.deepEqual(dispatched, ["finalize:completed"]);
  assert.deepEqual(dispatchedResults, ["completed"]);

  assert.rejects(
    () => dispatchRunKernelCommands(completed, {}),
    /Missing run kernel command handler for finalize/,
  );

  const saved: Array<{ sessionId: string; payload: unknown }> = [];
  const published: unknown[] = [];
  const toolRegistry = new ToolRegistry();
  registerDefaultTools(toolRegistry);
  const staticPorts = createStaticRuntimePorts({
    permissionEngine: new PermissionEngine(),
    safetyGuard: new SafetyGuard(),
    toolExecutor: new ToolExecutor(toolRegistry),
    contextManager: new DefaultContextManager(),
    verificationPipeline: new VerificationPipeline(),
    reviewEngine: new ReviewEngine(),
  });
  const runtimePorts = createRunScopedKernelPorts({
    staticPorts,
    sessionStore: {
      saveRunState: async (sessionId: string, payload: unknown) => {
        saved.push({ sessionId, payload });
      },
    },
    session: { id: "session_kernel" } as never,
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
    input: undefined,
    publish: async (_input, event) => {
      published.push(event);
    },
    finalize: (result) => ({ ...result, status: "success" }),
  });

  const runState = createRunState({
    id: "task_kernel",
    text: "test",
    cwd: "/tmp",
    mode: "ask",
    maxSteps: 3,
  });
  runState.kernel = createRunKernelState({ maxSteps: 3, phase: "calling_model" });
  await runtimePorts.stateStore.checkpoint(runState, "model_response");
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.sessionId, "session_kernel");

  await runtimePorts.events.publish({ type: "step_started", step: 1, maxSteps: 3 });
  assert.deepEqual(published, [{ type: "step_started", step: 1, maxSteps: 3 }]);

  const finalized = runtimePorts.completion.finalize(
    { status: "cancelled" } as never,
    runState,
  );
  assert.equal(finalized.status, "success");

  const processLogs: Array<{ area: string; message: string; metadata: unknown }> = [];
  const observedRunState = createRunState({
    id: "task_kernel_observed",
    text: "test",
    cwd: "/tmp",
    mode: "ask",
    maxSteps: 3,
  });
  observedRunState.kernel = createRunKernelState({
    maxSteps: 3,
    phase: "assembling_prompt",
  });
  await applyRunKernelEventAndCheckpoint(
    { id: "session_observed" },
    observedRunState,
    { type: "prompt_assembled" },
    {
      input: {
        eventBus: {
          emitProcessLog: async (area: string, message: string, metadata: unknown) => {
            processLogs.push({ area, message, metadata });
          },
        },
      } as never,
      checkpointPort: {
        checkpoint: async () => undefined,
      },
    },
  );
  assert.equal(processLogs.length, 1);
  assert.equal(processLogs[0]?.area, "core.run-kernel");
  assert.equal(processLogs[0]?.message, "Applied run kernel event.");
  assert.deepEqual(processLogs[0]?.metadata, {
    sessionId: "session_observed",
    eventType: "prompt_assembled",
    fromPhase: "assembling_prompt",
    toPhase: "calling_model",
    step: 0,
    maxSteps: 3,
    closingTurn: false,
    pendingToolCalls: 0,
    commands: ["checkpoint", "call_model"],
    checkpointReasons: ["prompt_assembled"],
    primaryCommand: "call_model",
  });
}
