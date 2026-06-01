import type { AgentMode, UserTask } from "@code-mind/shared";

const VAGUE_REPAIR_PATTERNS: RegExp[] = [
  /^fix\s+(the\s+)?tests?\s*[.!]?$/i,
  /^fix\s+test\s*[.!]?$/i,
  /^修复\s*测试(\s*失败)?\s*[。！]?$/,
  /^修\s*测试(\s*失败)?\s*[。！]?$/,
  /^测试\s*失败了?\s*[，,]?\s*帮我\s*看/,
  /^测试\s*失败\s*[。！]?$/,
  /^tests?\s+fail(ed|ing)?\s*[.!]?$/i,
  /^failing\s+tests?\s*[.!]?$/i,
];

const SPECIFIC_PATH_PATTERN =
  /(?:^|[\s"'`(])(?:\.{0,2}\/)?(?:[a-z0-9._-]+\/)+[a-z0-9._-]+\.[a-z0-9]+|[a-z0-9._-]+\.(?:ts|tsx|js|jsx|py|go|rs|java|cpp|md)\b/i;

const SPECIFIC_COMMAND_PATTERN =
  /\b(npm|pnpm|yarn|pytest|cargo|go)\s+(test|run)\b|\bnode\s+\S+\.js\b/i;

export function taskMentionsSpecificPath(text: string): boolean {
  return SPECIFIC_PATH_PATTERN.test(text.trim());
}

export function taskMentionsVerificationCommand(text: string): boolean {
  return SPECIFIC_COMMAND_PATTERN.test(text.trim());
}

export function isVagueRepairTask(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (taskMentionsSpecificPath(trimmed) || taskMentionsVerificationCommand(trimmed)) {
    return false;
  }
  if (trimmed.length > 120) {
    return false;
  }
  return VAGUE_REPAIR_PATTERNS.some((pattern) => pattern.test(trimmed));
}

const SCOPE_CONTROL_MODES = new Set<AgentMode>(["edit", "agent"]);

function isBroadRepoRootTask(task: UserTask, workspaceRoot: string): boolean {
  return task.cwd === workspaceRoot;
}

export function needsScopeControl(task: UserTask, workspaceRoot: string): boolean {
  if (!SCOPE_CONTROL_MODES.has(task.mode)) {
    return false;
  }
  if (task.metadata?.subagent === true) {
    return false;
  }
  if (isVagueRepairTask(task.text)) {
    return true;
  }
  if (
    isBroadRepoRootTask(task, workspaceRoot) &&
    !taskMentionsSpecificPath(task.text) &&
    !taskMentionsVerificationCommand(task.text)
  ) {
    return true;
  }
  return false;
}

export function buildScopeControlGuidance(
  task: UserTask,
  workspaceRoot: string,
  locale: "zh" | "en",
): string {
  const vague = isVagueRepairTask(task.text);
  const repoRoot = task.cwd === workspaceRoot;

  if (locale === "zh") {
    const lines = ["范围控制（准确率）："];
    if (vague) {
      lines.push(
        "1. 任务描述较模糊：先运行最相关的验证命令（如 npm test / node test.js / pytest），从失败输出定位具体文件，再改代码。",
        "2. 在确认失败位置前，不要修改任何文件。",
        "3. 只修与失败直接相关的最小文件集合；不要顺手重构、不要改 decoy/无关模块。",
      );
    } else {
      lines.push(
        "1. 这是仓库根目录级任务：前 1–2 步只做定位，锁定最相关的子目录/文件/验证命令。",
        "2. 在锁定范围前，不要修改任何文件。",
        "3. 优先最小修复：只改与任务直接相关的文件。",
      );
    }
    if (repoRoot) {
      lines.push("4. 禁止横向扫描全仓库；证据不足时先给出 top 1–3 个候选文件。");
    }
    return lines.join("\n");
  }

  const lines = ["Scope control (accuracy):"];
  if (vague) {
    lines.push(
      "1. The task is vague: run the most relevant verification command first (npm test, node test.js, pytest, etc.) and locate the failing file from output before editing.",
      "2. Do not modify files until the failure location is confirmed.",
      "3. Apply the smallest fix only; do not refactor or touch unrelated/decoy modules.",
    );
  } else {
    lines.push(
      "1. Repo-root task: use the first 1–2 steps only to locate the relevant subdirectory, files, and verification command.",
      "2. Do not modify files until the scope is narrowed.",
      "3. Prefer minimal fixes touching only task-relevant files.",
    );
  }
  if (repoRoot) {
    lines.push("4. Do not keep scanning the whole repo; if evidence is insufficient, state top 1–3 candidate files.");
  }
  return lines.join("\n");
}

export const FILE_MUTATION_TOOL_NAMES = new Set([
  "apply_patch",
  "search_replace",
  "write_file",
  "delete_file",
  "move_file",
]);

export function shouldRequestClarify(task: UserTask): boolean {
  if (!SCOPE_CONTROL_MODES.has(task.mode)) {
    return false;
  }
  if (task.metadata?.subagent === true) {
    return false;
  }
  if (task.metadata?.source === "benchmark") {
    return false;
  }
  if (task.metadata?.clarified === true) {
    return false;
  }
  return isVagueRepairTask(task.text);
}

export function buildClarifyQuestion(
  task: UserTask,
  workspaceRoot: string,
  locale: "zh" | "en",
): string {
  const repoRoot = task.cwd === workspaceRoot;
  if (locale === "zh") {
    return [
      "任务描述较模糊，请补充以下信息（可留空，agent 会自行推断）：",
      repoRoot ? "1. 目标 package / 子目录（例如 apps/cli、packages/core）" : "1. 相关文件或模块",
      "2. 验证命令（例如 pnpm test、node test.js、pytest path/to/test）",
    ].join("\n");
  }
  return [
    "The task is vague. Please clarify (leave blank to let the agent infer):",
    repoRoot ? "1. Target package / subdirectory (e.g. apps/cli, packages/core)" : "1. Relevant file or module",
    "2. Verification command (e.g. pnpm test, node test.js, pytest path/to/test)",
  ].join("\n");
}

export function formatClarificationContext(answer: string, locale: "zh" | "en"): string {
  const trimmed = answer.trim();
  if (trimmed.length === 0) {
    return "";
  }
  if (locale === "zh") {
    return `[用户补充]\n${trimmed}`;
  }
  return `[User clarification]\n${trimmed}`;
}
