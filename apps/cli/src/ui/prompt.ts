import { createInterface } from "./readline-interface.js";
import { stdin as input, stdout as output } from "node:process";
import type { AgentProfile } from "@code-mind/shared";

interface DefaultProfileOptions {
  repoRootFocus?: boolean;
}

function detectPromptFamily(modelName?: string): "deepseek" | "qwen" | "local" | "default" {
  const value = (modelName ?? "").toLowerCase();
  if (value.includes("deepseek")) {
    return "deepseek";
  }
  if (value.includes("qwen")) {
    return "qwen";
  }
  if (value.includes("local")) {
    return "local";
  }
  return "default";
}

function createSystemPrompt(
  modelName?: string,
  options: DefaultProfileOptions = {},
): string {
  const family = detectPromptFamily(modelName);
  const common = [
    "你是一个代码 Agent。",
    "回复语言优先跟随用户最新一条消息，项目里的代码、日志、README 和路径不是语言信号。",
    "你可以读取文件、搜索代码、应用 patch、运行测试。",
    "不要猜测文件内容，必须先读取文件或搜索代码。",
    "分析项目时，第一步优先 list_dir . 或 grep 关键入口文件，然后再读取具体文件。",
    "进入不熟悉的项目时，先定向探索，再读取关键文件，不要一开始就做大范围盲搜。",
    "大项目规则：探索 1 到 2 步后必须收敛到一个最可能的目录、文件或故障假设，后续围绕这个范围继续，不要持续横向扫描整个仓库。",
    "优先识别当前 workspace 的真实项目根，再决定读取 README、AGENTS.md、package.json、pyproject.toml 等入口文件。",
    "所有文件路径都必须相对当前 workspace root，除非工具结果明确给出了 workspace 内的绝对路径。",
    "不要生成、猜测或拼接 workspace 外的绝对路径。",
    "如果工具返回路径错误、文件不存在或权限错误，应修正路径后继续，而不是结束任务。",
    "工具结果是事实来源。读文件、搜索、shell 输出都要以最新工具结果为准，不要凭记忆续写。",
    "可用工具至少包括：list_dir、read_file、grep、apply_patch、run_shell。需要跑测试、build、lint、typecheck 时优先使用 run_shell。",
    "敏感文件不能读取。",
    "修改代码后应运行相关测试。",
    "如果需要修改文件，优先使用 apply_patch。",
    ...(options.repoRootFocus
      ? [
          "Repo-root 专项规则：你当前面对的是仓库根目录级任务。",
          "Repo-root 专项规则：前 1 到 2 步只能用来确定最相关的子目录、文件或故障假设，之后必须只围绕这个范围继续。",
          "Repo-root 专项规则：如果 2 步内还不能收敛，直接给出 top 1 到 3 个最可能的问题点和对应文件证据，不要继续横向扫描全仓库。",
        ]
      : []),
  ];

  const familyRules =
    family === "deepseek"
      ? [
          "DeepSeek 规则：进入项目先定向探索，优先 list_dir .，然后读取 README、AGENTS.md 或关键入口文件。",
          "DeepSeek 规则：在没有工具结果之前，不要假设项目路径、模块位置、框架类型或构建方式。",
          "DeepSeek 大项目规则：如果仓库较大，先形成一个最可能的故障假设，再只读取一到两个相关文件验证，不要连续做宽范围探索。",
          "DeepSeek 工具调用规则：优先一次只调用一个必要工具，避免一次并发发出多个高风险工具调用。",
          "返回工具参数时保持最小且精确，尤其是 path、command、patch。",
          "DeepSeek 恢复规则：如果某次工具调用失败，先根据错误修正下一次工具参数，不要直接结束任务。",
        ]
      : family === "qwen"
        ? [
            "Qwen 工具调用规则：先探索目录和入口文件，再决定后续读取或修改。",
            "避免输出与工具协议无关的伪 JSON 或额外包裹文本。",
          ]
        : family === "local"
          ? [
              "本地模型工具调用规则：优先短链路推理，小步读取，小步修改。",
              "如果上下文不足，继续读取相关文件，不要凭经验补全项目结构。",
            ]
          : [
              "工具调用规则：先探索，再读取，再修改，再验证。",
            ];

  return [...common, ...familyRules].join("\n");
}

export function createDefaultProfile(
  modelName?: string,
  options: DefaultProfileOptions = {},
): AgentProfile {
  return {
    id: options.repoRootFocus ? "repo-root-code-agent" : "default-code-agent",
    name: options.repoRootFocus ? "Repo Root Code Agent" : "Default Code Agent",
    systemPrompt: createSystemPrompt(modelName, options),
    metadata: {
      promptFamily: detectPromptFamily(modelName),
      ...(options.repoRootFocus ? { repoRootFocus: true } : {}),
    },
  };
}

export type ApprovalChoice = "once" | "always" | "deny";

export async function promptApprovalDecision(): Promise<ApprovalChoice> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return "deny";
  }

  process.stdout.write("\n");
  const rl = createInterface({ input, output });
  try {
    while (true) {
      const answer = await rl.question(
        "Allow? [y] yes, once  [a] always allow  [n] no  [e] explain: ",
      );
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === "y" || trimmed === "yes") {
        return "once";
      }
      if (trimmed === "a" || trimmed === "always") {
        return "always";
      }
      if (trimmed === "n" || trimmed === "no" || trimmed === "") {
        return "deny";
      }
      if (trimmed === "e" || trimmed === "explain") {
        console.log(
          "This action needs explicit approval before the agent can continue in your workspace.",
        );
      }
    }
  } finally {
    rl.close();
  }
}

export async function confirmAction(
  prompt: string,
  options: { showApprovalChoices?: boolean } = {},
): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }

  const rl = createInterface({ input, output });
  try {
    const suffix = options.showApprovalChoices
      ? " [y/a/N/e] "
      : " [y/N] ";
    const answer = await rl.question(`${prompt}${suffix}`);
    const trimmed = answer.trim().toLowerCase();
    return trimmed === "y" || trimmed === "yes" || trimmed === "a" || trimmed === "always";
  } finally {
    rl.close();
  }
}
