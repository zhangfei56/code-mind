import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestSessionStore } from "./helpers/session-store.js";
import {
  createAgentLoopController,
  runAgentSession,
} from "@code-mind/core";
import type {
  AgentProfile,
  ModelCapabilities,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  WorktreeInfo,
} from "@code-mind/shared";

class CountingProvider implements ModelProvider {
  name = "fake-resume-cwd";
  calls = 0;

  async chat(_request: ModelRequest): Promise<ModelResponse> {
    this.calls += 1;
    return {
      text: "continued",
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

export async function runResumeWorktreeTests(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "code-mind-resume-worktree-"));
  const executionCwd = join(workspace, "worktree-run");
  mkdirSync(join(executionCwd, "src"), { recursive: true });

  const profile: AgentProfile = {
    id: "default",
    name: "Default",
    systemPrompt: "You are a code agent.",
  };
  const store = createTestSessionStore(workspace);
  const worktree: WorktreeInfo = {
    id: "task_wt",
    path: executionCwd,
    branch: "agent/task_wt",
  };

  const session = await store.create(
    {
      id: "task_wt",
      text: "inspect worktree",
      cwd: executionCwd,
      mode: "ask",
      maxSteps: 2,
      metadata: { worktree },
    },
    profile,
  );
  await store.saveWorktree(session.id, worktree);
  await store.updateManifest(session.id, { executionCwd });

  const manifest = await store.readManifest(session.id);
  assert.equal(manifest.executionCwd, executionCwd);

  const restored = await store.restoreSession(session.id, profile);
  assert.equal(restored.task.cwd, executionCwd);
  assert.deepEqual(restored.task.metadata?.worktree, worktree);

  const loop = createAgentLoopController();
  const provider = new CountingProvider();
  const resumed = await runAgentSession({
    task: {
      id: "task_resume",
      text: "continue in worktree",
      cwd: workspace,
      mode: "ask",
      maxSteps: 2,
    },
    profile,
    model: provider,
    loop,
    workspaceRoot: workspace,
    resumeSessionId: session.id,
  });

  assert.equal(resumed.task.cwd, executionCwd);
  const afterResume = await store.readManifest(session.id);
  assert.equal(afterResume.executionCwd, executionCwd);
  assert.equal(provider.calls, 1);
}
