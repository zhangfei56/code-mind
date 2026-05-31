import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { readRunEvents, readSessionIndex } from "@code-mind/observability";
import type {
  AgentEvent,
  AgentProfile,
  AgentSession,
  InternalMessage,
  Observation,
  SessionManifest,
  ToolCall,
  UserTask,
  WorktreeInfo,
} from "@code-mind/shared";
import { createId, DEFAULT_MAX_STEPS } from "@code-mind/shared";

const CONVERSATION_KINDS = new Set<string>([
  "message.user",
  "message.assistant",
  "tool.call",
  "tool.result",
]);

async function loadSessionConversationEvents(
  workspaceRoot: string,
  sessionId: string,
): Promise<AgentEvent[]> {
  const index = await readSessionIndex(workspaceRoot, sessionId);
  const runIds = index?.runIds ?? [];
  const collected: AgentEvent[] = [];
  for (const runId of runIds) {
    collected.push(...(await readRunEvents(workspaceRoot, runId)));
  }
  const runOrder = new Map(runIds.map((id, idx) => [id, idx]));
  const filtered = collected.filter((e) => CONVERSATION_KINDS.has(e.kind));
  filtered.sort((a, b) => {
    const ar = runOrder.get(a.runId) ?? Number.MAX_SAFE_INTEGER;
    const br = runOrder.get(b.runId) ?? Number.MAX_SAFE_INTEGER;
    if (ar !== br) {
      return ar - br;
    }
    return a.seq - b.seq;
  });
  return filtered;
}

/** Rebuild in-memory session state from persisted run transcript events (resume path). */
export async function restoreAgentSession(input: {
  workspaceRoot: string;
  sessionId: string;
  manifest: SessionManifest;
  profile: AgentProfile;
  getCompactDir: (sessionId: string) => string;
  readWorktree: (sessionId: string) => Promise<WorktreeInfo | undefined>;
}): Promise<AgentSession> {
  const { sessionId, manifest, profile, workspaceRoot } = input;

  const events = await loadSessionConversationEvents(workspaceRoot, sessionId);

  const compactFiles = await readdir(input.getCompactDir(sessionId)).catch(() => []);
  const compactSummaries = await Promise.all(
    compactFiles
      .filter((file) => file.endsWith(".md"))
      .sort()
      .map((file) => readFile(join(input.getCompactDir(sessionId), file), "utf8")),
  );

  const { messages, observations } = rebuildConversationFromEvents(events);

  const compactionSummary =
    compactSummaries.length > 0 ? compactSummaries.join("\n\n") : undefined;

  const task: UserTask = {
    id: createId("task"),
    text: manifest.task,
    cwd: manifest.executionCwd ?? manifest.projectPath,
    mode: manifest.mode,
    maxSteps: manifest.maxSteps ?? DEFAULT_MAX_STEPS,
    requestedModel: manifest.model,
    ...(manifest.requestedMaxSteps === undefined
      ? {}
      : {
          metadata: { requestedMaxSteps: manifest.requestedMaxSteps },
        }),
  };
  const worktree = await input.readWorktree(sessionId);
  if (worktree) {
    task.metadata = { ...task.metadata, worktree };
  }

  return {
    id: sessionId,
    task,
    workspaceRoot: manifest.projectPath,
    profile,
    modelName: manifest.model,
    messages,
    observations,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    metadata: {
      restored: true,
      ...(compactionSummary === undefined ? {} : { compactionSummary }),
      ...(compactSummaries.length === 0
        ? {}
        : { compactionCount: compactSummaries.length }),
    },
  };
}

export function rebuildConversationFromEvents(events: AgentEvent[]): {
  messages: InternalMessage[];
  observations: Observation[];
} {
  const toolCallsById = new Map<string, ToolCall>();
  const messages: InternalMessage[] = [];
  const observations: Observation[] = [];

  for (const event of events) {
    switch (event.kind) {
      case "message.user": {
        const content = String((event.payload as { content?: unknown }).content ?? "");
        messages.push({
          id: createId("msg"),
          role: "user",
          content,
          createdAt: event.ts,
        });
        break;
      }
      case "message.assistant": {
        const payload = event.payload as {
          content?: unknown;
          toolCalls?: unknown;
          finishReason?: unknown;
        };
        const embeddedToolCalls = parseToolCallsFromPayload(payload.toolCalls);
        for (const toolCall of embeddedToolCalls) {
          toolCallsById.set(toolCall.id, toolCall);
        }
        messages.push({
          id: createId("msg"),
          role: "assistant",
          content: String(payload.content ?? ""),
          createdAt: event.ts,
          ...(embeddedToolCalls.length ? { toolCalls: embeddedToolCalls } : {}),
        });
        break;
      }
      case "tool.call": {
        const payload = event.payload as { toolCall?: ToolCall };
        const tc = payload.toolCall;
        if (!tc?.id || !tc.name) {
          break;
        }
        const toolCall: ToolCall = {
          id: String(tc.id),
          name: String(tc.name),
          arguments:
            typeof tc.arguments === "object" && tc.arguments !== null
              ? (tc.arguments as Record<string, unknown>)
              : {},
        };
        toolCallsById.set(toolCall.id, toolCall);
        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.role === "assistant") {
          const existing = lastMessage.toolCalls ?? [];
          if (!existing.some((item) => item.id === toolCall.id)) {
            lastMessage.toolCalls = [...existing, toolCall];
          }
        } else {
          messages.push({
            id: createId("msg"),
            role: "assistant",
            content: "",
            createdAt: event.ts,
            toolCalls: [toolCall],
          });
        }
        break;
      }
      case "tool.result": {
        const payload = event.payload as {
          toolCall?: ToolCall;
          success?: unknown;
          error?: unknown;
          output?: unknown;
          outputPreview?: unknown;
        };
        const corrId = event.correlation?.toolCallId;
        const embedded = payload.toolCall;
        let toolCall: ToolCall;
        if (embedded?.id) {
          toolCall =
            typeof embedded.arguments === "object" && embedded.arguments !== null
              ? {
                  id: String(embedded.id),
                  name: String(embedded.name ?? "unknown"),
                  arguments: embedded.arguments as Record<string, unknown>,
                }
              : {
                  id: String(embedded.id),
                  name: String(embedded.name ?? "unknown"),
                  arguments: {},
                };
        } else if (corrId) {
          const existing = toolCallsById.get(corrId);
          toolCall = existing ?? {
            id: String(corrId),
            name: "unknown",
            arguments: {},
          };
        } else {
          toolCall = { id: createId("call"), name: "unknown", arguments: {} };
        }
        toolCallsById.set(toolCall.id, toolCall);

        const success = Boolean(payload.success);
        const rawOutput =
          typeof payload.output === "string"
            ? payload.output
            : typeof payload.outputPreview === "string"
              ? payload.outputPreview
              : "";
        const output = success ? rawOutput : `ERROR: ${String(payload.error ?? rawOutput ?? "")}`;
        messages.push({
          id: createId("msg"),
          role: "tool",
          content: output,
          createdAt: event.ts,
          toolCallId: toolCall.id,
          name: toolCall.name,
        });
        observations.push({
          toolCall,
          toolResult: {
            success,
            output: String(payload.output ?? payload.outputPreview ?? ""),
            ...(payload.error === undefined ? {} : { error: String(payload.error) }),
          },
          createdAt: event.ts,
        });
        break;
      }
    }
  }

  return { messages, observations };
}

function parseToolCallsFromPayload(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((item) => ({
      id: String(item.id ?? createId("call")),
      name: String(item.name ?? "unknown"),
      arguments:
        typeof item.arguments === "object" && item.arguments !== null
          ? (item.arguments as Record<string, unknown>)
          : {},
    }));
}
