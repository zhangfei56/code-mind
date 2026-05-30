import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunState, serializeRunState } from "@code-mind/core";
import { applyRunKernelEventAndCheckpoint } from "@code-mind/core";
import type { AgentEvent, RuntimeInput, UserTask } from "@code-mind/shared";
import { createTestSessionStore } from "./helpers/session-store.js";

class RecordingEventBus {
  readonly events: AgentEvent[] = [];

  async emit(event: import("@code-mind/shared").AgentEventInput): Promise<AgentEvent> {
    const built = {
      id: "evt_test",
      ts: new Date().toISOString(),
      runId: "run_test",
      sessionId: "session_test",
      seq: this.events.length + 1,
      kind: event.kind,
      level: event.level ?? "info",
      source: { component: "test", surface: "system" as const },
      payload: event.payload ?? {},
    } satisfies AgentEvent;
    this.events.push(built);
    return built;
  }

  async emitProcessLog(): Promise<void> {}

  async flush(): Promise<void> {}

  async finish(): Promise<void> {}

  subscribe(): () => void {
    return () => {};
  }

  runId = "run_test";
  sessionId = "session_test";
}

export async function runKernelObservabilityTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-kernel-obs-"));
  const store = createTestSessionStore(workspace);
  const task: UserTask = {
    id: "task_obs",
    text: "observe kernel",
    cwd: workspace,
    mode: "ask",
    maxSteps: 3,
  };
  const session = await store.create(task, {
    id: "default",
    name: "Default",
    systemPrompt: "test",
  });
  const runState = createRunState(task);
  const bus = new RecordingEventBus();
  const input: RuntimeInput = {
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
    eventBus: bus as never,
  };

  await applyRunKernelEventAndCheckpoint(
    session,
    runState,
    {
      type: "step_started",
      step: 1,
      maxSteps: 3,
      closingTurn: false,
    },
    {
      input,
      checkpointPort: {
        checkpoint: async (state) => {
          await store.saveRunState(session.id, serializeRunState(state));
        },
      },
    },
  );

  const transitionEvent = bus.events.find((event) => event.kind === "kernel.transition");
  assert.ok(transitionEvent, "expected kernel.transition in event log");
  assert.equal(transitionEvent.payload.eventType, "step_started");
  assert.equal(transitionEvent.payload.fromPhase, "initializing");
  assert.equal(transitionEvent.payload.toPhase, "assembling_prompt");
  assert.deepEqual(transitionEvent.payload.commands, ["checkpoint", "assemble_prompt"]);
  assert.deepEqual(transitionEvent.payload.checkpointReasons, ["step_start"]);
  assert.equal(transitionEvent.payload.step, 1);
  assert.equal(transitionEvent.payload.primaryCommand, "assemble_prompt");
}

export async function runCoreStabilityAuditTests(): Promise<void> {
  const root = join(process.cwd());
  const requiredPaths = [
    "packages/core/src/agent/kernel/run-state-machine.ts",
    "packages/core/src/agent/kernel/invariants.ts",
    "packages/core/src/agent/runtime/kernel-runtime.ts",
    "packages/core/src/agent/runtime/run-state-persistence.ts",
    "packages/core/src/agent/runtime/tool-call/authorization.ts",
    "packages/core/src/agent/runtime/ports/index.ts",
    "packages/core/src/agent/runtime/runtime-event-hub.ts",
    "packages/agent-composition/src/compose-agent-loop.ts",
    "packages/capabilities/src/capability-selector.ts",
    "packages/session/src/session-store.ts",
    "packages/verify/src/verification.ts",
    "docs/completion-audit-checklist.md",
    "docs/core-boundary.md",
  ];

  for (const relativePath of requiredPaths) {
    assert.ok(
      existsSync(join(root, relativePath)),
      `missing required stability artifact: ${relativePath}`,
    );
  }

  const coreIndex = await readFile(join(root, "packages/core/src/index.ts"), "utf8");
  assert.doesNotMatch(coreIndex, /@code-mind\/session/);
  assert.doesNotMatch(coreIndex, /@code-mind\/capabilities/);
  assert.doesNotMatch(coreIndex, /@code-mind\/verify/);

  const appsCli = await readFile(join(root, "apps/cli/src/commands/sessions.ts"), "utf8");
  assert.doesNotMatch(appsCli, /FileSessionStore/);
  const apiWebUi = await readFile(join(root, "apps/api-server/src/web-ui.ts"), "utf8");
  assert.doesNotMatch(apiWebUi, /FileSessionStore/);
  const benchmark = await readFile(join(root, "apps/cli/src/benchmarks/run-p0.ts"), "utf8");
  assert.match(benchmark, /runAgentSession/);
  assert.doesNotMatch(benchmark, /loop\.run\s*\(/);

  const removedCompatPaths = [
    "packages/core/src/agent/runtime-event-hub.ts",
    "packages/core/src/extensions",
    "packages/core/src/session",
    "packages/core/src/verify",
  ];
  for (const relativePath of removedCompatPaths) {
    assert.equal(
      existsSync(join(root, relativePath)),
      false,
      `compat copy should be removed: ${relativePath}`,
    );
  }
}
