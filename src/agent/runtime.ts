import type {
  AgentResult,
  AgentSession,
  AuditRecord,
  ContextManager,
  ModelProvider,
  Observation,
  PermissionDecisionRecord,
  PermissionDecision,
  PermissionRequest,
  RuntimeInput,
  ToolCall,
  ToolContext,
} from "../shared/types.js";
import { FileSessionStore } from "../session/session-store.js";
import { createSessionRecord } from "../session/session-record.js";
import { ToolRegistry } from "../tools/registry.js";
import { registerDefaultTools } from "../tools/default-tools.js";
import { PermissionEngine } from "../permissions/permission-engine.js";
import { DefaultContextManager } from "../context/context-manager.js";
import { createId } from "../shared/ids.js";
import { nowIso } from "../shared/time.js";
import { ResultBuilder } from "./result-builder.js";
import { buildPatchPreview } from "../tools/apply-patch.js";
import { buildCurrentSummary } from "../session/summary-writer.js";
import { SafetyGuard } from "../safety/safety-guard.js";
import {
  applyCompaction,
  buildCompactionSummary,
  shouldCompact,
} from "../context/compaction.js";
import { HookSystem } from "../extensions/hook-system.js";

export interface PermissionPrompter {
  approve(toolCall: ToolCall, decision: Extract<PermissionDecision, { type: "ask" }>): Promise<boolean>;
}

interface RuntimeDependencies {
  contextManager?: ContextManager;
  permissionEngine?: PermissionEngine;
  safetyGuard?: SafetyGuard;
  hookSystem?: HookSystem;
  toolRegistry?: ToolRegistry;
  sessionStoreFactory?: (workspaceRoot: string) => FileSessionStore;
  permissionPrompter?: PermissionPrompter;
}

function createToolContext(session: AgentSession): ToolContext {
  return {
    sessionId: session.id,
    workspaceRoot: session.workspaceRoot,
    cwd: session.task.cwd,
    mode: session.task.mode,
  };
}

export class AgentRuntime {
  private readonly contextManager: ContextManager;
  private readonly permissionEngine: PermissionEngine;
  private readonly safetyGuard: SafetyGuard;
  private readonly hookSystem: HookSystem | undefined;
  private readonly toolRegistry: ToolRegistry;
  private readonly sessionStoreFactory: (workspaceRoot: string) => FileSessionStore;
  private readonly permissionPrompter: PermissionPrompter | undefined;
  private readonly resultBuilder = new ResultBuilder();

  constructor(dependencies: RuntimeDependencies = {}) {
    this.contextManager = dependencies.contextManager ?? new DefaultContextManager();
    this.permissionEngine = dependencies.permissionEngine ?? new PermissionEngine();
    this.safetyGuard = dependencies.safetyGuard ?? new SafetyGuard();
    this.hookSystem = dependencies.hookSystem;
    this.toolRegistry = dependencies.toolRegistry ?? new ToolRegistry();
    if (!dependencies.toolRegistry) {
      registerDefaultTools(this.toolRegistry);
    }
    this.sessionStoreFactory =
      dependencies.sessionStoreFactory ??
      ((workspaceRoot: string) => new FileSessionStore(workspaceRoot));
    this.permissionPrompter = dependencies.permissionPrompter;
  }

  async run(input: RuntimeInput): Promise<AgentResult> {
    const sessionStore = this.sessionStoreFactory(input.sessionRoot ?? input.task.cwd);
    const session = input.resumeSessionId
      ? await sessionStore.restoreSession(input.resumeSessionId, input.profile)
      : await sessionStore.create(input.task, input.profile);
    try {
      await this.runHooks("SessionStart", sessionStore, session, {
        event: "SessionStart",
        sessionId: session.id,
        projectPath: session.workspaceRoot,
        runMode: session.task.mode,
      });
      session.task = {
        ...session.task,
        ...input.task,
      };
      session.profile = input.profile;
      session.modelName = input.model.name;
      await sessionStore.updateManifest(session.id, { model: input.model.name });
      if (!session.messages.some((message) => message.role === "user")) {
        const userMessage = {
          id: createId("msg"),
          role: "user" as const,
          content: input.task.text,
          createdAt: nowIso(),
        };
        session.messages.push(userMessage);
        await sessionStore.appendRecord(
          createSessionRecord(session.id, "user_message", { content: userMessage.content }),
        );
      }
      await sessionStore.saveCurrentSummary(
        session.id,
        buildCurrentSummary(session, input.model.name),
      );

      for (let step = 0; step < input.task.maxSteps; step += 1) {
        const context = await this.contextManager.build({
          session,
          task: input.task,
          profile: input.profile,
        });

        const response = await input.model.chat({
          messages: context.messages,
          tools: this.toolRegistry.getSchemas(),
        });
        await this.runHooks("AfterModelCall", sessionStore, session, {
          event: "AfterModelCall",
          sessionId: session.id,
          projectPath: session.workspaceRoot,
          runMode: session.task.mode,
          modelRequest: {
            messages: context.messages,
            tools: this.toolRegistry.getSchemas(),
          },
          modelResponse: response,
        });
        await sessionStore.appendModelCall(session.id, {
          model: input.model.name,
          messageCount: context.messages.length,
          toolCount: response.toolCalls.length,
          finishReason: response.finishReason,
        });
        await sessionStore.appendAuditRecord({
          sessionId: session.id,
          type: "model_call",
          createdAt: nowIso(),
          payload: {
            model: input.model.name,
            messageCount: context.messages.length,
            toolCount: response.toolCalls.length,
            finishReason: response.finishReason,
          },
        });

        session.messages.push({
          id: createId("msg"),
          role: "assistant",
          content: response.text,
          createdAt: nowIso(),
          ...(response.toolCalls.length ? { toolCalls: response.toolCalls } : {}),
        });

        await sessionStore.appendRecord(
          createSessionRecord(session.id, "assistant_message", {
            content: response.text,
            finishReason: response.finishReason,
          }),
        );
        await sessionStore.saveCurrentSummary(
          session.id,
          buildCurrentSummary(session, input.model.name, response.text),
        );

        if (response.toolCalls.length === 0) {
          const result = this.resultBuilder.success(
            session.id,
            input.model.name,
            step + 1,
            response.text,
          );
          await this.completeRun(sessionStore, session, result);
          return result;
        }

        for (const toolCall of response.toolCalls) {
          await sessionStore.appendRecord(
            createSessionRecord(session.id, "tool_call", {
              id: toolCall.id,
              name: toolCall.name,
              arguments: toolCall.arguments,
            }),
          );

          const decision = await this.permissionEngine.check({
            toolCall,
            mode: input.task.mode,
            workspaceRoot: session.workspaceRoot,
          } satisfies PermissionRequest);
          const safetyDecision = await this.safetyGuard.check({
            toolCall,
            mode: input.task.mode,
            workspaceRoot: session.workspaceRoot,
          });
          const finalDecision = this.mergeDecisions(decision, safetyDecision);
          await sessionStore.appendPermissionDecision(
            this.createPermissionDecisionRecord(session.id, toolCall, finalDecision),
          );
          await sessionStore.appendAuditRecord({
            sessionId: session.id,
            type: "permission_decision",
            createdAt: nowIso(),
            payload: {
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              decision: finalDecision.type,
              reason: "reason" in finalDecision ? finalDecision.reason : "",
            },
          });

          const approved = await this.resolvePermission(toolCall, finalDecision);
          if (finalDecision.type === "ask") {
            await sessionStore.appendAuditRecord({
              sessionId: session.id,
              type: "user_approval",
              createdAt: nowIso(),
              payload: {
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                approved: approved.allowed,
                reason: approved.reason,
                ...(toolCall.name === "apply_patch" &&
                typeof toolCall.arguments.patch === "string"
                  ? { diffPreview: buildPatchPreview(toolCall.arguments.patch) }
                  : {}),
              },
            });
          }
          if (!approved.allowed) {
            const observation: Observation = {
              toolCall,
              toolResult: {
                success: false,
                output: "",
                error: approved.reason,
              },
              createdAt: nowIso(),
            };
            await this.contextManager.addObservation(session, observation);
            session.messages.push({
              id: createId("msg"),
              role: "tool",
              content: `ERROR: ${approved.reason}`,
              createdAt: nowIso(),
              toolCallId: toolCall.id,
              name: toolCall.name,
            });
            await sessionStore.appendRecord(
              createSessionRecord(session.id, "tool_result", {
                toolCallId: toolCall.id,
                success: false,
                error: approved.reason,
              }),
            );
            await sessionStore.saveCurrentSummary(
              session.id,
              buildCurrentSummary(session, input.model.name, approved.reason),
            );
            const result =
              approved.status === "permission_denied"
                ? this.resultBuilder.permissionDenied(
                    session.id,
                    input.model.name,
                    step + 1,
                    approved.reason,
                  )
                : this.resultBuilder.userRejected(
                    session.id,
                    input.model.name,
                    step + 1,
                    approved.reason,
                  );
            await this.completeRun(sessionStore, session, result);
            return result;
          }

          const preToolResults = await this.runHooks("PreToolUse", sessionStore, session, {
            event: "PreToolUse",
            sessionId: session.id,
            projectPath: session.workspaceRoot,
            runMode: session.task.mode,
            toolCall,
          });
          const blockingHook = preToolResults.find(
            (item) => item.action === "deny" || item.action === "ask",
          );
          if (blockingHook?.action === "deny") {
            const result = this.resultBuilder.permissionDenied(
              session.id,
              input.model.name,
              step + 1,
              blockingHook.reason,
            );
            await this.completeRun(sessionStore, session, result);
            return result;
          }

          if (toolCall.name === "apply_patch") {
            const beforePatchHookInput = {
              event: "BeforePatchApply" as const,
              sessionId: session.id,
              projectPath: session.workspaceRoot,
              runMode: session.task.mode,
              toolCall,
              ...(typeof toolCall.arguments.patch === "string"
                ? { patch: toolCall.arguments.patch }
                : {}),
            };
            await this.runHooks("BeforePatchApply", sessionStore, session, {
              ...beforePatchHookInput,
            });
          }
          if (toolCall.name === "run_shell") {
            await this.runHooks("BeforeShellRun", sessionStore, session, {
              event: "BeforeShellRun",
              sessionId: session.id,
              projectPath: session.workspaceRoot,
              runMode: session.task.mode,
              toolCall,
            });
          }
          const result = await this.toolRegistry.execute(
            toolCall,
            createToolContext(session),
          );
          await sessionStore.appendAuditRecord({
            sessionId: session.id,
            type: "tool_execution",
            createdAt: nowIso(),
            payload: {
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              arguments: toolCall.arguments,
            },
          });

          const observation: Observation = {
            toolCall,
            toolResult: result,
            createdAt: nowIso(),
          };
          await this.contextManager.addObservation(session, observation);
          session.messages.push({
            id: createId("msg"),
            role: "tool",
            content: result.success
              ? result.output
              : `ERROR: ${result.error ?? result.output}`,
            createdAt: nowIso(),
            toolCallId: toolCall.id,
            name: toolCall.name,
          });
          await sessionStore.appendRecord(
            createSessionRecord(session.id, "tool_result", {
              toolCallId: toolCall.id,
              success: result.success,
              output: result.output,
              error: result.error,
            }),
          );
          await sessionStore.appendAuditRecord({
            sessionId: session.id,
            type: "tool_result",
            createdAt: nowIso(),
            payload: {
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              success: result.success,
              error: result.error,
            },
          });

          await this.runHooks("PostToolUse", sessionStore, session, {
            event: "PostToolUse",
            sessionId: session.id,
            projectPath: session.workspaceRoot,
            runMode: session.task.mode,
            toolCall,
            toolResult: result,
          });

          if (toolCall.name === "apply_patch") {
            await sessionStore.appendRecord(
              createSessionRecord(session.id, "patch", {
                toolCallId: toolCall.id,
                patch: toolCall.arguments.patch,
                success: result.success,
                metadata: result.metadata,
                artifacts: result.artifacts,
              }),
            );
            const afterPatchHookInput = {
              event: "AfterPatchApply" as const,
              sessionId: session.id,
              projectPath: session.workspaceRoot,
              runMode: session.task.mode,
              toolCall,
              toolResult: result,
              ...(typeof toolCall.arguments.patch === "string"
                ? { patch: toolCall.arguments.patch }
                : {}),
            };
            await this.runHooks("AfterPatchApply", sessionStore, session, {
              ...afterPatchHookInput,
            });
          }
          if (toolCall.name === "run_shell") {
            await this.runHooks("AfterShellRun", sessionStore, session, {
              event: "AfterShellRun",
              sessionId: session.id,
              projectPath: session.workspaceRoot,
              runMode: session.task.mode,
              toolCall,
              toolResult: result,
            });
          }
          await sessionStore.saveCurrentSummary(
            session.id,
            buildCurrentSummary(session, input.model.name),
          );
          await this.compactSessionIfNeeded(sessionStore, session, input.model.name);
        }
      }
      const result = this.resultBuilder.stoppedByLimit(
        session.id,
        input.model.name,
        input.task.maxSteps,
      );
      await this.completeRun(sessionStore, session, result);
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Runtime execution failed.";
      const result = this.resultBuilder.failed(
        session.id,
        input.model.name,
        0,
        message,
      );
      await this.completeRun(sessionStore, session, result);
      return result;
    }
  }

  private createPermissionDecisionRecord(
    sessionId: string,
    toolCall: ToolCall,
    decision: PermissionDecision,
  ): PermissionDecisionRecord {
    return {
      sessionId,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      decision: decision.type,
      reason: "reason" in decision ? decision.reason : "",
      createdAt: nowIso(),
      metadata: {
        arguments: toolCall.arguments,
      },
    };
  }

  private async resolvePermission(
    toolCall: ToolCall,
    decision: PermissionDecision,
  ): Promise<{
    allowed: boolean;
    reason: string;
    status: "permission_denied" | "user_rejected";
  } | {
    allowed: true;
    reason: string;
  }> {
    if (decision.type === "allow") {
      return { allowed: true, reason: "" };
    }

    if (decision.type === "deny") {
      return {
        allowed: false,
        reason: decision.reason,
        status: "permission_denied",
      };
    }

    if (!this.permissionPrompter) {
      return {
        allowed: false,
        reason: decision.reason,
        status: "user_rejected",
      };
    }

    const approved = await this.permissionPrompter.approve(toolCall, decision);
    return approved
      ? { allowed: true, reason: "" }
      : {
          allowed: false,
          reason: "User rejected this tool call.",
          status: "user_rejected",
        };
  }

  private async completeRun(
    sessionStore: FileSessionStore,
    session: AgentSession,
    result: AgentResult,
  ): Promise<void> {
    const currentSummary = buildCurrentSummary(
      session,
      result.modelName,
      result.finalText,
    );
    await sessionStore.saveCurrentSummary(session.id, currentSummary);
    await sessionStore.saveSummary(session.id, result.summary ?? result.finalText);
    await sessionStore.appendRecord(
      createSessionRecord(session.id, "summary", {
        text: result.summary ?? result.finalText,
        status: result.status,
      }),
    );
    await sessionStore.updateManifest(session.id, {
      model: result.modelName,
      status: result.status,
    });
    await this.runHooks("SessionEnd", sessionStore, session, {
      event: "SessionEnd",
      sessionId: session.id,
      projectPath: session.workspaceRoot,
      runMode: session.task.mode,
      metadata: {
        status: result.status,
      },
    });
  }

  private mergeDecisions(
    baseDecision: PermissionDecision,
    safetyDecision: PermissionDecision,
  ): PermissionDecision {
    if (baseDecision.type === "deny" || safetyDecision.type === "deny") {
      return baseDecision.type === "deny" ? baseDecision : safetyDecision;
    }
    if (baseDecision.type === "ask" || safetyDecision.type === "ask") {
      return baseDecision.type === "ask" ? baseDecision : safetyDecision;
    }
    return { type: "allow" };
  }

  private async compactSessionIfNeeded(
    sessionStore: FileSessionStore,
    session: AgentSession,
    modelName: string,
  ): Promise<void> {
    if (!shouldCompact(session)) {
      return;
    }

    const summary = buildCompactionSummary(session);
    const compactPath = await sessionStore.saveCompactSummary(session.id, summary);
    applyCompaction(session, summary);
    await sessionStore.appendAuditRecord({
      sessionId: session.id,
      type: "context_compact",
      createdAt: nowIso(),
      payload: {
        path: compactPath,
        compactionCount: session.metadata?.compactionCount,
      },
    });
    await sessionStore.saveCurrentSummary(
      session.id,
      buildCurrentSummary(session, modelName),
    );
  }

  private async runHooks(
    event: import("../shared/types.js").HookEvent,
    sessionStore: FileSessionStore,
    session: AgentSession,
    input: import("../shared/types.js").HookInput,
  ) {
    if (!this.hookSystem) {
      return [];
    }
    const results = await this.hookSystem.run(event, input);
    for (const result of results) {
      await sessionStore.appendAuditRecord({
        sessionId: session.id,
        type: "hook_execution",
        createdAt: nowIso(),
        payload: {
          event,
          action: result.action,
          ...(result.action === "deny" || result.action === "ask"
            ? { reason: result.reason }
            : {}),
        },
      });
    }
    return results;
  }
}
