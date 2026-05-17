import type {
  AgentResult,
  AgentSession,
  ContextManager,
  ModelProvider,
  Observation,
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

export interface PermissionPrompter {
  approve(toolCall: ToolCall, decision: Extract<PermissionDecision, { type: "ask" }>): Promise<boolean>;
}

interface RuntimeDependencies {
  contextManager?: ContextManager;
  permissionEngine?: PermissionEngine;
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
  private readonly toolRegistry: ToolRegistry;
  private readonly sessionStoreFactory: (workspaceRoot: string) => FileSessionStore;
  private readonly permissionPrompter: PermissionPrompter | undefined;

  constructor(dependencies: RuntimeDependencies = {}) {
    this.contextManager = dependencies.contextManager ?? new DefaultContextManager();
    this.permissionEngine = dependencies.permissionEngine ?? new PermissionEngine();
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
    const sessionStore = this.sessionStoreFactory(input.task.cwd);
    const session = await sessionStore.create(input.task, input.profile);
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

      if (response.toolCalls.length === 0) {
        const result: AgentResult = {
          sessionId: session.id,
          status: "success",
          finalText: response.text,
          steps: step + 1,
          modelName: input.model.name,
          summary: response.text,
        };
        await sessionStore.saveSummary(session.id, response.text);
        await sessionStore.appendRecord(
          createSessionRecord(session.id, "summary", { text: response.text }),
        );
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

        const approved = await this.resolvePermission(toolCall, decision);
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
          continue;
        }

        const result = await this.toolRegistry.execute(
          toolCall,
          createToolContext(session),
        );

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

        if (toolCall.name === "apply_patch") {
          await sessionStore.appendRecord(
            createSessionRecord(session.id, "patch", {
              toolCallId: toolCall.id,
              patch: toolCall.arguments.patch,
              success: result.success,
            }),
          );
        }
      }
    }

    const finalText = "Stopped because max steps limit was reached.";
    await sessionStore.saveSummary(session.id, finalText);
    return {
      sessionId: session.id,
      status: "stopped_by_limit",
      finalText,
      steps: input.task.maxSteps,
      modelName: input.model.name,
      summary: finalText,
    };
  }

  private async resolvePermission(
    toolCall: ToolCall,
    decision: PermissionDecision,
  ): Promise<{ allowed: boolean; reason: string }> {
    if (decision.type === "allow") {
      return { allowed: true, reason: "" };
    }

    if (decision.type === "deny") {
      return { allowed: false, reason: decision.reason };
    }

    if (!this.permissionPrompter) {
      return { allowed: false, reason: decision.reason };
    }

    const approved = await this.permissionPrompter.approve(toolCall, decision);
    return approved
      ? { allowed: true, reason: "" }
      : { allowed: false, reason: "User rejected this tool call." };
  }
}
