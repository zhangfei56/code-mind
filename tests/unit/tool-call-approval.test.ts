import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentLoopController } from "@code-mind/core";
import type {
  AgentProfile,
  HookInput,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  AgentEvent,
  SessionStatus,
  UserTask,
} from "@code-mind/shared";
import { FileSessionStore } from "@code-mind/session";
import type { PersistedRunState } from "@code-mind/shared";
import { HookSystem } from "@code-mind/capabilities";
import type { PermissionPrompter } from "@code-mind/core";

const VALID_PATCH = [
  "*** Begin Patch",
  "*** Update File: src/math.ts",
  "@@",
  "-  return a - b;",
  "+  return a + b;",
  "*** End Patch",
].join("\n");

class PatchToolProvider implements ModelProvider {
  name = "fake-approval";
  private step = 0;

  async chat(_request: ModelRequest): Promise<ModelResponse> {
    this.step += 1;
    if (this.step === 1) {
      return {
        text: "",
        finishReason: "tool_call",
        raw: {},
        toolCalls: [
          {
            id: "call_patch",
            name: "apply_patch",
            arguments: { patch: VALID_PATCH },
          },
        ],
      };
    }
    return {
      text: "Patch applied.",
      finishReason: "stop",
      raw: {},
      toolCalls: [],
    };
  }

  getCapabilities(): ModelCapabilities {
    return {
      toolCall: true,
      parallelToolCall: false,
      jsonSchema: true,
      vision: false,
      reasoning: false,
      maxContextTokens: 100000,
      maxOutputTokens: 8000,
      supportsPromptCache: false,
      supportsComputerUse: false,
    };
  }
}

class ReadFileToolProvider implements ModelProvider {
  name = "fake-hook-ask";

  async chat(_request: ModelRequest): Promise<ModelResponse> {
    return {
      text: "",
      finishReason: "tool_call",
      raw: {},
      toolCalls: [
        {
          id: "call_read",
          name: "read_file",
          arguments: { path: "src/math.ts" },
        },
      ],
    };
  }

  getCapabilities(): ModelCapabilities {
    return {
      toolCall: true,
      parallelToolCall: false,
      jsonSchema: true,
      vision: false,
      reasoning: false,
      maxContextTokens: 100000,
      maxOutputTokens: 8000,
      supportsPromptCache: false,
      supportsComputerUse: false,
    };
  }
}

class RecordingPrompter implements PermissionPrompter {
  readonly order: string[] = [];
  private resolveDecision: ((approved: boolean) => void) | undefined;

  approve: PermissionPrompter["approve"] = async (_sessionId, _toolCall, _decision, options) => {
    this.order.push("approve_start");
    await options?.onPending?.("approval_test");
    this.order.push("approve_pending");
    const approved = await new Promise<boolean>((resolve) => {
      this.resolveDecision = resolve;
    });
    return { approved, approvalId: "approval_test" };
  };

  resolve(approved: boolean): void {
    this.resolveDecision?.(approved);
  }
}

class RecordingSessionStore extends FileSessionStore {
  readonly savedRunStates: PersistedRunState[] = [];

  override async saveRunState(sessionId: string, runState: PersistedRunState): Promise<void> {
    this.savedRunStates.push(JSON.parse(JSON.stringify(runState)) as PersistedRunState);
    await super.saveRunState(sessionId, runState);
  }
}

function setupWorkspace(prefix: string): string {
  const workspace = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(workspace, "src"), { recursive: true });
  writeFileSync(
    join(workspace, "src", "math.ts"),
    "export function add(a: number, b: number): number {\n  return a - b;\n}\n",
    "utf8",
  );
  return workspace;
}

class PassingVerificationPipeline {
  async run() {
    return {
      passed: true,
      summary: "ok",
      steps: [{ name: "test", success: true, summary: "passed" }],
    };
  }
}

class PassingReviewEngine {
  review() {
    return {
      passed: true,
      issues: [],
      suggestions: [],
      requiresAnotherIteration: false,
    };
  }
}

export async function runToolCallApprovalTests(): Promise<void> {
  const workspace = setupWorkspace("code-mind-tool-approval-");
  const prompter = new RecordingPrompter();
  const sessionStore = new RecordingSessionStore(workspace);
  const statuses: SessionStatus[] = [];
  const events: AgentEvent[] = [];

  const loop = createAgentLoopController({
    permissionPrompter: prompter,
    sessionStoreFactory: () => sessionStore,
    verificationPipeline: new PassingVerificationPipeline() as never,
    reviewEngine: new PassingReviewEngine() as never,
  });
  const profile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "demo",
  };
  const task: UserTask = {
    id: "task_1",
    text: "patch file",
    cwd: workspace,
    mode: "edit",
    maxSteps: 5,
  };

  const runPromise = loop.run({
    task,
    profile,
    model: new PatchToolProvider(),
    onStatusChange: (status) => {
      statuses.push(status);
    },
    onEvent: (event) => {
      events.push(event);
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(
    statuses.includes("awaiting_approval"),
    "should enter awaiting_approval before decision",
  );
  assert.ok(
    events.some(
      (event) =>
        event.kind === "approval.requested" && (event.payload as { approvalId?: string }).approvalId === "approval_test",
    ),
    "should emit approval_requested with id while waiting",
  );
  assert.ok(
    prompter.order.indexOf("approve_pending") > prompter.order.indexOf("approve_start"),
  );
  assert.ok(
    sessionStore.savedRunStates.some((item) => item.kernel.phase === "awaiting_approval"),
    "kernel state should be checkpointed while approval is pending",
  );
  assert.ok(
    sessionStore.savedRunStates.some((item) => item.kernel.phase === "calling_model"),
    "kernel state should be checkpointed when prompt assembly hands off to the model",
  );

  prompter.resolve(true);
  const result = await runPromise;
  assert.equal(result.status, "success");
  assert.ok(statuses.includes("running"));
  assert.ok(
    sessionStore.savedRunStates.some(
      (item) =>
        item.kernel.phase === "assembling_prompt" &&
        item.kernel.step === 1 &&
        item.kernel.pendingToolCalls === 0,
    ),
    "kernel state should checkpoint after all tool calls are handled",
  );
  assert.equal(
    sessionStore.savedRunStates[sessionStore.savedRunStates.length - 1]?.kernel.phase,
    "completed",
    "final persisted kernel state should be completed",
  );
}

export async function runHookAskApprovalTests(): Promise<void> {
  const workspace = setupWorkspace("code-mind-hook-ask-");
  const prompter = new RecordingPrompter();
  let hookInput: HookInput | undefined;
  const hookSystem = new HookSystem({}, workspace);
  hookSystem.run = async (_event, input) => {
    hookInput = input;
    return [{ action: "ask", reason: "Hook requires confirmation." }];
  };

  const loop = createAgentLoopController({
    permissionPrompter: prompter,
    hookSystem,
  });

  const runPromise = loop.run({
    task: {
      id: "task_hook",
      text: "read file",
      cwd: workspace,
      mode: "edit",
      maxSteps: 3,
    },
    profile: {
      id: "default",
      name: "Default",
      systemPrompt: "demo",
    },
    model: new ReadFileToolProvider(),
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(hookInput, "PreToolUse hook should run after permission allows read_file");
  prompter.resolve(false);
  const result = await runPromise;
  assert.equal(result.status, "user_rejected");
  assert.equal(result.metadata?.rejectionSource, "hook");
  assert.equal(result.metadata?.rejectionKind, "user_rejected");
}

export async function runHookDenyApprovalTests(): Promise<void> {
  const workspace = setupWorkspace("code-mind-hook-deny-");
  const hookSystem = new HookSystem({}, workspace);
  hookSystem.run = async () => [{ action: "deny", reason: "Hook blocked this tool." }];

  const loop = createAgentLoopController({ hookSystem });

  const result = await loop.run({
    task: {
      id: "task_hook_deny",
      text: "read file",
      cwd: workspace,
      mode: "edit",
      maxSteps: 3,
    },
    profile: {
      id: "default",
      name: "Default",
      systemPrompt: "demo",
    },
    model: new ReadFileToolProvider(),
  });

  assert.equal(result.status, "permission_denied");
  assert.equal(result.metadata?.rejectionSource, "hook");
  assert.equal(result.metadata?.rejectionKind, "policy_denied");
}
