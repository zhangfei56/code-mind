export interface MemoryItem {
  id: string;
  content: string;
  score?: number;
}

export interface MemorySummary {
  text: string;
}

export interface SearchOptions {
  limit?: number;
}

export interface TaskContext {
  sessionId: string;
  taskText: string;
}

export interface MemoryProvider {
  capture(event: unknown): Promise<void>;
  summarize(sessionId: string): Promise<MemorySummary>;
  search(query: string, options?: SearchOptions): Promise<MemoryItem[]>;
  inject(task: TaskContext): Promise<MemoryItem[]>;
}
