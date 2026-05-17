import { FileSessionStore } from "../session/session-store.js";
import type {
  AgentPlan,
  AgentProfile,
  AgentResult,
  DiagnosticItem,
  ModelProvider,
  ReviewResult,
  UserTask,
  VerificationResult,
} from "../shared/types.js";
import { AgentRuntime } from "../agent/runtime.js";
import { PlanManager } from "./plan-manager.js";
import { createTaskState, transitionTaskState } from "./task-state.js";
import { VerificationPipeline } from "./verification.js";
import { ReviewEngine } from "./review-engine.js";
import { GitManager } from "./git-manager.js";
import { LspAdapter } from "./lsp-adapter.js";
import { RecoveryEngine } from "./recovery-engine.js";
import { WorktreeManager } from "./worktree-manager.js";

export interface EngineeringRunOptions {
  task: UserTask;
  profile: AgentProfile;
  model: ModelProvider;
  runtime: AgentRuntime;
  workspaceRoot: string;
  planFirst?: boolean;
  planOnly?: boolean;
  useWorktree?: boolean;
  approvePlan?: (planMarkdown: string) => Promise<boolean>;
}

export interface EngineeringRunResult {
  sessionId: string;
  taskCwd: string;
  plan?: AgentPlan;
  runtimeResult?: AgentResult;
  verification?: VerificationResult;
  review?: ReviewResult;
  diagnostics?: DiagnosticItem[];
}

export class EngineeringOrchestrator {
  private readonly plans = new PlanManager();
  private readonly verification = new VerificationPipeline();
  private readonly review = new ReviewEngine();
  private readonly git = new GitManager();
  private readonly lsp = new LspAdapter();
  private readonly recovery = new RecoveryEngine();
  private readonly worktrees = new WorktreeManager();

  async run(options: EngineeringRunOptions): Promise<EngineeringRunResult> {
    const store = new FileSessionStore(options.workspaceRoot);
    const session = await store.create(options.task, options.profile);
    let taskState = createTaskState(options.task.id);
    await store.saveTaskState(session.id, taskState);

    const plan = options.planOnly || options.planFirst
      ? this.plans.createPlan(options.task.text, options.workspaceRoot)
      : undefined;

    if (plan) {
      taskState = transitionTaskState(taskState, "planning", { planId: plan.id });
      await store.saveTaskState(session.id, taskState);
      await store.savePlan(session.id, plan, this.plans.renderMarkdown(plan));
      taskState = transitionTaskState(taskState, "awaiting_approval", {
        ...(plan.steps[0]?.id === undefined ? {} : { currentStep: plan.steps[0].id }),
      });
      await store.saveTaskState(session.id, taskState);
      if (options.planOnly) {
        return {
          sessionId: session.id,
          taskCwd: options.workspaceRoot,
          plan,
        };
      }
      if (options.approvePlan && !(await options.approvePlan(this.plans.renderMarkdown(plan)))) {
        taskState = transitionTaskState(taskState, "cancelled");
        await store.saveTaskState(session.id, taskState);
        return {
          sessionId: session.id,
          taskCwd: options.workspaceRoot,
          plan,
        };
      }
    }

    let taskCwd = options.workspaceRoot;
    if (options.useWorktree) {
      const worktree = await this.worktrees.create(options.workspaceRoot, options.task.id);
      await store.saveWorktree(session.id, worktree);
      taskCwd = worktree.path;
    }

    taskState = transitionTaskState(taskState, "executing");
    await store.saveTaskState(session.id, taskState);

    const runtimeTask = {
      ...options.task,
      cwd: taskCwd,
    };

    let runtimeResult = await options.runtime.run({
      task: runtimeTask,
      profile: options.profile,
      model: options.model,
      resumeSessionId: session.id,
      sessionRoot: options.workspaceRoot,
    });

    const diagnostics = await this.lsp.diagnostics(taskCwd);
    await store.saveDiagnostics(session.id, diagnostics);

    taskState = transitionTaskState(taskState, "verifying");
    await store.saveTaskState(session.id, taskState);
    let verification = await this.verification.run(taskCwd);
    for (const step of verification.steps) {
      await store.saveTestResult(session.id, {
        success: step.success,
        command: step.command ?? step.name,
        exitCode: step.exitCode ?? 0,
        durationMs: step.durationMs ?? 0,
        stdout: "",
        stderr: "",
        summary: {
          failedTests: [],
          errorMessages: [step.summary],
          likelyFiles: [],
          rawExcerpt: step.summary,
        },
      });
    }
    await store.saveVerification(session.id, verification);

    const failedResults = verification.steps
      .filter((step) => !step.success)
      .map((step) => ({
        success: false,
        command: step.command ?? step.name,
        exitCode: step.exitCode ?? 1,
        durationMs: step.durationMs ?? 0,
        stdout: "",
        stderr: step.summary,
        summary: {
          failedTests: [],
          errorMessages: [step.summary],
          likelyFiles: [],
          rawExcerpt: step.summary,
        },
      }));

    const recovery = this.recovery.decideFromVerification(failedResults, 1, 2);
    if (
      recovery.shouldRetry &&
      recovery.nextTaskHint &&
      runtimeResult.status === "success"
    ) {
      await store.appendRecoveryEvent(session.id, {
        type: "verification_retry",
        reason: recovery.reason,
      });
      runtimeResult = await options.runtime.run({
        task: {
          ...runtimeTask,
          text: `${options.task.text}\n\n${recovery.nextTaskHint}`,
        },
        profile: options.profile,
        model: options.model,
        resumeSessionId: session.id,
        sessionRoot: options.workspaceRoot,
      });
      verification = await this.verification.run(taskCwd);
      await store.saveVerification(session.id, verification);
    }

    taskState = transitionTaskState(taskState, "reviewing");
    await store.saveTaskState(session.id, taskState);
    const changedFiles = await this.git.changedFiles(taskCwd);
    const diff = await this.git.diff(taskCwd);
    const review = this.review.review({
      task: options.task.text,
      ...(plan === undefined ? {} : { plan }),
      changedFiles: [
        ...changedFiles.modified,
        ...changedFiles.deleted,
        ...changedFiles.untracked,
      ],
      diff,
      testResults: [],
    });
    await store.saveReview(session.id, review);

    taskState = transitionTaskState(
      taskState,
      review.passed && verification.passed && runtimeResult.status === "success"
        ? "completed"
        : "failed",
    );
    await store.saveTaskState(session.id, taskState);

    return {
      sessionId: session.id,
      taskCwd,
      ...(plan === undefined ? {} : { plan }),
      runtimeResult,
      verification,
      review,
      diagnostics,
    };
  }
}
