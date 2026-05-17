export function createRuntimeSystemPrompt(basePrompt: string): string {
  return [
    basePrompt,
    "",
    "工具使用规则：",
    "1. 不要猜测文件内容，必须先读取文件或搜索代码。",
    "2. 修改代码前先理解问题原因。",
    "3. 应用 patch 时使用如下格式：",
    "*** Begin Patch",
    "*** Update File: path/to/file",
    "@@",
    "-old line",
    "+new line",
    "*** End Patch",
    "4. 修改代码后优先运行相关测试。",
    "5. 如果工具返回失败，要根据返回结果继续分析，而不是假设已经成功。",
  ].join("\n");
}
