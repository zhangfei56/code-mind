import type {
  MemoryItem,
  MemoryProvider,
  MemorySummary,
  SearchOptions,
  TaskContext,
} from "./memory-provider.interface.js";

export class NoopMemoryProvider implements MemoryProvider {
  async capture(): Promise<void> {}

  async summarize(): Promise<MemorySummary> {
    return { text: "" };
  }

  async search(_query: string, _options?: SearchOptions): Promise<MemoryItem[]> {
    return [];
  }

  async inject(_task: TaskContext): Promise<MemoryItem[]> {
    return [];
  }
}
