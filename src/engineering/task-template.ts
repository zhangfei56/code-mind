export type EngineeringTaskTemplate =
  | "bug_fix"
  | "refactor"
  | "add_feature"
  | "code_review"
  | "write_tests";

export function classifyTaskTemplate(task: string): EngineeringTaskTemplate {
  const normalized = task.toLowerCase();
  if (
    normalized.includes("review") ||
    normalized.includes("审查") ||
    normalized.includes("code review")
  ) {
    return "code_review";
  }
  if (
    normalized.includes("refactor") ||
    normalized.includes("重构") ||
    normalized.includes("拆出来")
  ) {
    return "refactor";
  }
  if (
    normalized.includes("test") ||
    normalized.includes("测试") ||
    normalized.includes("补测试")
  ) {
    return "write_tests";
  }
  if (
    normalized.includes("feature") ||
    normalized.includes("功能") ||
    normalized.includes("实现")
  ) {
    return "add_feature";
  }
  return "bug_fix";
}
